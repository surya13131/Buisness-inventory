const { getBucket } = require("../config/firebase");
const { AppError } = require("./productController"); 
const companyService = require("../services/companyService");
const bucket = getBucket();

async function validateCompanyAccess(companyId) {
    if (!companyId) throw new AppError(400, "Company ID is required.");

    const company = await companyService.getCompanyById(companyId);

    if (!company) {
        throw new AppError(404, "Access Denied: Company record not found.");
    }

    // Ensure only active companies can add data
    if (company.status === "SUSPENDED") {
        throw new AppError(403, "Access Denied: Account suspended.");
    }
    
    return company; 
}

const getCustomerFile = (companyId, customerId) =>
    bucket.file(`companies/${companyId}/customers/${customerId}.json`);

function isValidGST(gst) {
    const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return pattern.test(gst.toUpperCase());
}

function isValidPhone(phone) {
    const pattern = /^[6-9]\d{9}$/;
    return pattern.test(phone);
}

function isValidEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
}

// Helper to validate 6-digit Indian Pincode
function isValidPincode(pincode) {
    const pattern = /^[1-9][0-9]{5}$/;
    return pattern.test(pincode);
}

async function createCustomer(companyId, data) {
    // 1. Verify company exists and is active
    await validateCompanyAccess(companyId);

    const { 
        name, 
        phone, 
        email = "", 
        address = "", 
        district = "", 
        pincode = "", 
        gst = "" 
    } = data || {};

    // 2. Data Validation
    if (!name || !phone) {
        throw new AppError(400, "Missing required fields: Name and Phone.");
    }

    // 2b. Optional GST Format Check
    if (gst && !isValidGST(gst)) {
        throw new AppError(400, "Invalid GST Number format. Must be 15 characters.");
    }

    // 2c. Phone Format Check
    if (!isValidPhone(phone)) {
        throw new AppError(400, "Invalid Phone Number. Please provide a 10-digit mobile number.");
    }

    // 2d. Pincode Format Check (Optional but validated if provided)
    if (pincode && !isValidPincode(pincode)) {
        throw new AppError(400, "Invalid Pincode. Please provide a valid 6-digit number.");
    }

    // 2e. Email Format Check
    if (email && !isValidEmail(email)) {
        throw new AppError(400, "Invalid Email Address format.");
    }

    const normalizedGST = gst ? gst.toUpperCase() : "";

    // 3. Duplicate Check (Only if GST is provided)
    if (normalizedGST) {
        const existingCustomers = await getAllCustomers(companyId);
        if (existingCustomers.some(c => c.gst === normalizedGST)) {
            throw new AppError(409, "A customer with this GST already exists.");
        }
    }

    const customerId = `CUST-${Date.now()}`;

    const customer = {
        companyId, 
        id: customerId,
        name,
        phone,
        email,
        address,
        district, 
        pincode,  
        gst: normalizedGST,
        status: "ENABLED",
        createdAt: new Date().toISOString(),
    };

    try {
        await getCustomerFile(companyId, customerId).save(
            JSON.stringify(customer, null, 2),
            { contentType: "application/json", resumable: false }
        );

        return { success: true, message: "Customer created successfully.", customer };
    } catch (error) {
        throw new AppError(500, "Failed to save customer data.");
    }
}

async function updateCustomer(companyId, customerId, data) {
    await validateCompanyAccess(companyId);

    const file = getCustomerFile(companyId, customerId);
    const [exists] = await file.exists();
    if (!exists) throw new AppError(404, "Customer not found.");

    const [content] = await file.download();
    const existingData = JSON.parse(content.toString());

    const { name, phone, email, address, district, pincode, gst, status } = data;

    // Validate updates if provided
    if (gst && !isValidGST(gst)) throw new AppError(400, "Invalid GST format.");
    if (phone && !isValidPhone(phone)) throw new AppError(400, "Invalid Phone number.");
    if (pincode && !isValidPincode(pincode)) throw new AppError(400, "Invalid Pincode.");

    const updatedCustomer = {
        ...existingData,
        name: name || existingData.name,
        phone: phone || existingData.phone,
        email: email !== undefined ? email : existingData.email,
        address: address !== undefined ? address : existingData.address,
        district: district !== undefined ? district : existingData.district, // Updated
        pincode: pincode !== undefined ? pincode : existingData.pincode,    // Updated
        gst: gst ? gst.toUpperCase() : existingData.gst,
        status: status || existingData.status,
        updatedAt: new Date().toISOString()
    };

    try {
        await file.save(JSON.stringify(updatedCustomer, null, 2), {
            contentType: "application/json",
            resumable: false
        });
        return { success: true, message: "Customer updated successfully.", customer: updatedCustomer };
    } catch (error) {
        throw new AppError(500, "Failed to update customer data.");
    }
}

async function deleteCustomer(companyId, customerId) {
    await validateCompanyAccess(companyId);

    const file = getCustomerFile(companyId, customerId);
    const [exists] = await file.exists();

    if (!exists) throw new AppError(404, "Customer not found.");

    try {
        await file.delete();
        return { success: true, message: "Customer deleted successfully." };
    } catch (error) {
        throw new AppError(500, "Failed to delete customer.");
    }
}

async function getAllCustomers(companyId) {
    await validateCompanyAccess(companyId);

    const [files] = await bucket.getFiles({
        prefix: `companies/${companyId}/customers/`,
    });

    if (files.length === 0) return [];

    const customerPromises = files
        .filter(file => file.name.endsWith(".json"))
        .map(async (file) => {
            try {
                const [content] = await file.download();
                return JSON.parse(content.toString());
            } catch (err) {
                return null; 
            }
        });

    const customers = await Promise.all(customerPromises);

    return customers
        .filter(c => c !== null && c.companyId === companyId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getAllCustomers,
};
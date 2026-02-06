const { getBucket } = require("../config/firebase");
const { AppError } = require("./productController"); 
const companyService = require("../services/companyService");

// Initialize bucket by calling the function
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

async function createCustomer(companyId, data) {
    // 1. Verify company exists and is active
    await validateCompanyAccess(companyId);

    const { name, phone, email = "", address = "", gst } = data || {};

    // 2. Data Validation (Required Fields)
    if (!name || !phone || !gst) {
        throw new AppError(400, "Missing required fields: Name, Phone, and GST.");
    }

    // 2b. GST Format Check
    if (!isValidGST(gst)) {
        throw new AppError(400, "Invalid GST Number format. Must be 15 characters (e.g., 22AAAAA0000A1Z5).");
    }

    // 2c. Phone Format Check
    if (!isValidPhone(phone)) {
        throw new AppError(400, "Invalid Phone Number. Please provide a 10-digit mobile number.");
    }

    // 2d. Email Format Check (Only if email is provided)
    if (email && !isValidEmail(email)) {
        throw new AppError(400, "Invalid Email Address format.");
    }

    const normalizedGST = gst.toUpperCase();

    // 3. Duplicate Check (Optimized)
    const existingCustomers = await getAllCustomers(companyId);
    if (existingCustomers.some(c => c.gst === normalizedGST)) {
        throw new AppError(409, "A customer with this GST already exists.");
    }

    const customerId = `CUST-${Date.now()}`;

    const customer = {
        companyId, // 🔒 Mandatory ownership stamp
        id: customerId,
        name,
        phone,
        email,
        address,
        gst: normalizedGST,
        status: "ENABLED",
        createdAt: new Date().toISOString(),
    };

    // 4. Save to Cloud Storage
    try {
        await getCustomerFile(companyId, customerId).save(
            JSON.stringify(customer, null, 2),
            { 
                contentType: "application/json",
                resumable: false // Faster for small JSON files
            }
        );

        return {
            success: true,
            message: "Customer created successfully.",
            customer,
        };
    } catch (error) {
        throw new AppError(500, "Failed to save customer data.");
    }
}

/**
 * GET ALL CUSTOMERS: Retrieves all billing profiles for the company.
 */
async function getAllCustomers(companyId) {
    // 🔒 Ensure the company is valid before fetching
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
    getAllCustomers,
};
const { getBucket } = require("../config/firebase");
const { analyzeData } = require("../services/aiService");
const sanitizeData = (data) => {
  if (Array.isArray(data)) return data.map(item => sanitizeData(item));
  if (typeof data === "object" && data !== null) {
    const cleanObj = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === "") {
        // Aligns numbers to 0 and text to N/A
        const isNumericField = key.toLowerCase().includes('price') || 
                               key.toLowerCase().includes('stock') || 
                               key.toLowerCase().includes('amount') ||
                               key.toLowerCase().includes('total');
        cleanObj[key] = isNumericField ? 0 : "N/A";
      } else {
        cleanObj[key] = sanitizeData(value);
      }
    }
    return cleanObj;
  }
  return data;
};

const handleAiQuery = async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");

    const { question } = req.body || {};
    const companyId = req.companyId || req.body?.companyId;
    

const companyName = req.headers["x-company-name"] || req.body?.companyName || "the company";

    if (!question || !companyId) {
      return res.status(400).json({ status: "error", message: "Missing required fields." });
    }


    const cleanQuestion = question.trim().toLowerCase();
    const conversationalTriggers = ["hi", "hey", "hello", "how are you", "who are you", "what can you do"];
    const isGeneralConversation = conversationalTriggers.some(t => cleanQuestion.startsWith(t)) && cleanQuestion.split(" ").length <= 6;

    if (isGeneralConversation) {
      // Pass companyName here to ensure greeting is personalized
      const answer = await analyzeData(question, {}, companyName);
      return res.status(200).json({ status: "success", answer });
    }

    /* -------------------------------------------------
        2️⃣ LOAD & ORGANIZE DATA WITH CROSS-CHECKING
    -------------------------------------------------- */
    const bucket = getBucket();
    const prefix = `companies/${companyId}/`;
    const [files] = await bucket.getFiles({ prefix });

    // Added 'movements' to the rawData structure
    const rawData = { products: [], invoices: [], customers: [], movements: [] };

    for (const file of files) {
      if (!file.name.endsWith(".json")) continue;
      const parts = file.name.split("/");
      const folderName = parts[parts.length - 2];

      try {
        const [content] = await file.download();
        const parsed = JSON.parse(content.toString());
        
        if (rawData[folderName]) {
          // Rule: Movement files contain history arrays; others contain single records
          if (folderName === "movements" && Array.isArray(parsed)) {
            rawData.movements.push(...parsed);
          } else {
            rawData[folderName].push(parsed);
          }
        }
      } catch (err) {
        console.warn(`File deleted during processing: ${file.name}`);
      }
    }

    const activeSkus = new Set(rawData.products.map(p => p.sku?.toString()));

    // Sanitize and tag invoices to inform AI about deleted products
    const filteredInvoices = rawData.invoices.map(inv => {
      const cleanInv = sanitizeData(inv);
      if (cleanInv.items) {
        cleanInv.items = cleanInv.items.map(item => ({
          ...item,
          // If the SKU isn't in our active list, mark it as deleted
          itemStatus: activeSkus.has(item.sku?.toString()) ? "ACTIVE" : "DELETED_FROM_CATALOG"
        }));
      }
      return cleanInv;
    });

    // Final Aligned Structure
    const finalContext = {
      activeProducts: sanitizeData(rawData.products),
      salesRecords: filteredInvoices,
      customers: sanitizeData(rawData.customers),
      // Injected movement history for the AI to analyze stock changes
      stockMovementHistory: sanitizeData(rawData.movements),
      systemMetadata: {
        currentTimestamp: new Date().toISOString(),
        companyId: companyId,
        companyName: companyName, 
        note: "Items marked 'DELETED_FROM_CATALOG' are historical only. 'stockMovementHistory' contains a full audit log of all quantity changes."
      }
    };

    const answer = await analyzeData(question, finalContext, companyName);

    return res.status(200).json({ status: "success", answer });

  } catch (error) {
    console.error("AI Controller Error:", error);
    return res.status(200).json({
      status: "success",
      answer: "I'm checking the latest data. Please ask your question again in a second! 🙂"
    });
  }
};

module.exports = { handleAiQuery };
const { VertexAI } = require("@google-cloud/vertexai");

// Gemini MUST run in us-central1 for optimal performance and availability
const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT,
  location: "us-central1",
});

let model;

/**
 * Initializes and caches the Gemini model with a rigid System Instruction.
 * The system instruction now uses a placeholder for the company name to remain dynamic.
 */
function getModel(companyName = "the company") {
  // We recreate the model instance if the company name changes to ensure correct identity
  return vertexAI.getGenerativeModel({
    model: "gemini-2.0-flash-001",
    systemInstruction: {
      role: "system",
      parts: [
  {
  text:
    `ROLE: You are the Lead Business Intelligence Analyst for ${companyName}. ` +
    "STRICT RULES: " +
    "1. GROUNDING: If business data is provided, your answer MUST be 100% based on that data. " +
    "2. CURRENCY: This is an Indian business. ALWAYS use the Indian Rupee symbol (₹) for all amounts. NEVER use dollars ($). " +
    "3. ACCURACY: For stock-related questions, look at 'stockOnHand' or 'actualStock' fields. Do not guess numbers. " +
    "4. CALCULATIONS: If you need to sum values, perform the math carefully. " +
    "5. CANCELLED DATA: Always ignore invoices marked as 'Cancelled' when calculating sales or profit. " +
    "6. NO HALLUCINATION: If the requested information is missing from the data, say 'I do not have a record for that.' " +
    "7. STRUCTURE: Use Markdown tables for comparisons and bold text for key figures. " +
    "8. CONVERSATION: If no data is provided, be a helpful and friendly AI assistant. " +
    "9. PRIVACY: NEVER mention specific file paths or internal JSON structures. " +
    "10. DELETED ITEMS: If an item or customer is mentioned in invoices but is not in the activeProducts/activeCustomers list, explicitly state it is 'No longer in current inventory' and do not list it as available stock. " +
    "11. INTENT FILTER: You must distinguish between a direct query for data and a conversational acknowledgment or compliment. " +
    `12. ACKNOWLEDGMENT RULE: If the user input is a compliment or acknowledgment (e.g., 'okay', 'thanks', 'great', 'wow', 'super', 'nice', 'perfect'), do NOT provide a table or analysis. Respond ONLY with a polite closing: 'You're welcome! I'm here if you need any more analysis for ${companyName}. Is there anything else?'` +
    "13. TIME CONTEXT: Always respect dates and timestamps in the data. Do not assume 'today', 'this month', or 'current' unless explicitly stated in the records. " +
    "14. STATUS AWARENESS: Clearly distinguish between Paid, Unpaid, Partially Paid, Cancelled, and Overdue invoices. Never merge them unless explicitly requested. " +
    "15. NO IMPLIED TRENDS: Do not claim growth, decline, or trends unless at least two comparable time periods exist in the data. " +
    "16. ROUNDING RULE: Monetary values must be displayed exactly as calculated. Do not round unless explicitly requested. " +
    "17. ROW TRACEABILITY: Every total or aggregate must be explainable by the rows shown. Do not present totals without visible source data. " +
    "18. ACTION LINKS: If an invoice or document is downloadable, present the action strictly as a Markdown link labeled [Download]. Do not expose URLs or file paths. " +
    "19. DUPLICATE HANDLING: If duplicate invoices, customers, or products exist, explicitly mention duplicates and treat each record separately unless instructed otherwise. " +
    "20. QUERY SCOPE CONTROL: Answer ONLY what the user explicitly asks. If a specific number like 'Top 5' or 'Lowest 3' is requested, provide EXACTLY that number of rows. " +
    "21. ERROR TRANSPARENCY: If a calculation cannot be completed due to missing data, clearly state what information is missing instead of estimating. " +
    "22. PROFESSIONAL OUTPUT: Maintain a concise, factual, business-professional tone. Avoid emojis, jokes, or casual language in analytical responses. " +
    "23. MATHEMATICAL DISCIPLINE: Perform all calculations step-by-step using only provided numeric fields. Do not skip steps or infer values. " +
    "24. FORMULA LOCK: Use only system-defined formulas. If a requested metric has no defined formula, state that it cannot be calculated. " +
    "25. DATA COMPLETENESS CHECK: If any required field for a calculation is missing or null, stop and clearly state what data is missing. " +
    "26. ZERO ASSUMPTION RULE: Do not assume dates, quantities, prices, payment status, or stock levels under any circumstance. " +
    "27. ROW TRACEABILITY: Do not present totals or aggregates unless each contributing row is visible and explainable. " +
    "28. CONTROLLER SUPREMACY: Treat backend controller outputs as the single source of truth. Do not reinterpret, adjust, or override business logic. " +
    "29. TYPO RESILIENCE: If the user makes a spelling mistake like 'mvoememnt', 'hsorty', or 'porduct', interpret it as 'Stock Movement History' or 'Product' based on the closest matching data field. " +
    "30. AGGREGATE ONLY BY DEFAULT: Unless the user says 'list' or 'show all', prioritize a summarized bold answer. " +
    "31. RANKING ENFORCEMENT: If 'highest' or 'lowest' is used, you MUST sort the data accordingly before selecting rows. " +
    "32. CONCENTRATED ANALYSIS: Internally verify the logic (sorting column vs. requested value) before generating the Markdown table to ensure zero row-mismatches. " +

    // 🔒 NEW HARD SAFETY RULES (ADDED, NOTHING REMOVED)
    "33. OUTPUT SANITIZATION: NEVER output raw JSON objects, internal records, or full entity dumps (products, invoices, movements, users). Only provide summarized, human-readable business answers unless the user explicitly asks to 'show data', 'list records', or 'display raw details'. " +
    "34. DELETED ITEM WORDING LOCK: When an item is not present in activeProducts or activeCustomers, you MUST use the exact phrase 'No longer in current inventory'. Do not paraphrase this wording. " +
    "35. SELF-VERIFICATION (INTERNAL ONLY): Before responding, internally verify calculations, sorting logic, deleted-item rules, and scope compliance. If an issue is found, correct it before output. Do NOT mention this verification step. " +
    "36. MINIMAL RESPONSE RULE: If the user asks for a single value or state, provide only the required answer and mandatory compliance notes. Do not add explanations, background context, or unrelated fields."
}

      ]
    }
  });
}

/**
 * Analyzes the user question against the structured business data.
 */
const analyzeData = async (question, jsonData = {}, companyName = "the company") => {
  if (!question) {
    return "Please ask a question 🙂";
  }

  const hasBusinessData = jsonData && Object.keys(jsonData).length > 0;
  const cleanQ = question.toLowerCase().trim();

  // Triggers for immediate acknowledgment handling
  const exitTriggers = [
    "ok", "okay", "thanks", "thank you", "leave it",
    "nothing else", "great", "nice", "perfect", "awesome", "good", "super", "wow"
  ];

  const isAcknowledgment = exitTriggers.includes(cleanQ);

  // GIBBERISH FILTER
  const isGibberish = cleanQ.length < 3 && !["hi", "no", "up"].includes(cleanQ);

  const prompt = isAcknowledgment
    ? `The user is acknowledging the previous answer (they said "${question}"). 
        DO NOT provide data, tables, or analysis. 
        Just say: "You're welcome! I'm glad I could help. Let me know if you need any more analysis for ${companyName}."`
    : isGibberish
    ? `The user provided a very short or unclear input: "${question}". 
        Politely ask them to clarify their business query.`
    : hasBusinessData
    ? `
### USER INTENT PROTOCOL:
1. **IDENTIFY QUANTITY**: If the user asks for "top 5", "highest 10", "lowest", or "only one", you MUST filter.
2. **SORTING LOGIC**: 
   - "Highest/Most/Best" = Sort Descending (High to Low).
   - "Lowest/Lesser/Least" = Sort Ascending (Low to High).
3. **NO DATA DUMPING**: If the user asks for "the highest stock," do NOT list the entire inventory. Return ONLY the top row.
4. **VERIFY MISMATCH**: Double-check that the item name and the stock value match the row exactly.

### TRAINING PROTOCOLS:
- INTENT CHECK: Evaluate if the input is a compliment (e.g., "wow", "super"). If so, do NOT provide data.
- MINIMALISM: Provide ONLY what is asked. Do not include extra summaries or tables if not requested.
- IDENTITY: You are currently representing ${companyName}.
- FORMULA: Inventory Value = (stockOnHand * averageCost).
- PROFIT: Gross Profit = (Selling Price - averageCost).
- REORDER LOGIC: If stockOnHand <= reorderLevel, tag item as **LOW STOCK**.
- VERIFICATION: Check 'activeProducts'. If an item is missing from this list, it is DELETED. 
- CURRENCY: All amounts are in Indian Rupees (₹).
- Provide a concrete answer with specific numbers and bold text for key figures.
- Use Markdown tables for all data listings.

<BUSINESS_CONTEXT>
${JSON.stringify(jsonData, null, 2)}
</BUSINESS_CONTEXT>

### USER QUESTION:
"${question}"

Please provide your final analysis based ONLY on the data above in Indian Rupee (₹) format:
`
    : `
### CONVERSATION:
The user is having a normal chat. Respond naturally, politely, and helpfully as the representative for ${companyName}.

QUESTION:
"${question}"
`;

  try {
    const activeModel = getModel(companyName);

    const result = await activeModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.0, // Strict precision
        topP: 0.8,
        maxOutputTokens: 2048,
      }
    });

    const responseText =
      result.response?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        ?.join("") ||
      "I’m here to help 🙂 What would you like to know?";

    return responseText;

  } catch (err) {
    console.error("Vertex Gemini Error:", err);
    return "I’m having a small issue accessing the data right now, but I’m still here to help! Could you try asking that again?";
  }
};

module.exports = { analyzeData };
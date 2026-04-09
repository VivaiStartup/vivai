
import { GoogleGenAI, Type } from "@google/genai";
import { Product, DiagnosisResult } from "../types";

// Always use process.env.API_KEY directly as per guidelines
export const getDiagnosisAndRecommendation = async (
  species: string,
  symptoms: string[],
  availableProducts: Product[]
): Promise<DiagnosisResult> => {
  // Fix: Initialize with process.env.API_KEY directly as a named parameter per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const productContext = availableProducts.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category_id,
    brand: p.brand
  }));

  const prompt = `Diagnosi pianta VIVaI.
  Specie: ${species}
  Sintomi: ${symptoms.join(", ")}
  Prodotti disponibili nel vivaio: ${JSON.stringify(productContext)}
  
  Analizza i sintomi e suggerisci azioni correttive e i prodotti migliori tra quelli in lista. 
  Restituisci solo un oggetto JSON valido.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            actions: { type: Type.ARRAY, items: { type: Type.STRING } },
            products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  product_id: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  isBestChoice: { type: Type.BOOLEAN }
                },
                required: ["product_id", "reason", "isBestChoice"]
              }
            },
            explanation: { type: Type.STRING },
            confidence: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] }
          },
          required: ["actions", "products", "explanation", "confidence"]
        },
      },
    });

    // Access .text property directly (not as a method)
    const data = JSON.parse(response.text || "{}");
    return data as DiagnosisResult;
  } catch (e) {
    console.error("Failed to fetch or parse Gemini response", e);
    // Returning correctly typed fallback object
    return {
      actions: ["Innaffia con moderazione", "Controlla le radici"],
      products: [],
      explanation: "Spiacenti, si è verificato un errore nella diagnosi via IA.",
      confidence: "LOW"
    };
  }
};

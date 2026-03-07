import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
// Note: In a real production app, you might want to proxy this through a backend
// to keep the key secure, but for this client-side demo we use the env var directly
// as per the environment setup.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface BeeAnalysisResult {
  nome_popular: string;
  nome_cientifico: string;
  tipo_ferrao: string;
  caracteristicas: string;
  habitat: string;
  curiosidade_especial: string;
  confianca_percentual: string;
}

export async function analyzeBeeImage(base64Image: string): Promise<BeeAnalysisResult> {
  // Remove the data URL prefix if present to get just the base64 string
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const prompt = `
    Analise esta imagem e identifique a espécie de abelha.
    Se não for uma abelha, retorne o JSON indicando que não é uma abelha no campo nome_popular.
    
    Responda OBRIGATORIAMENTE apenas com um objeto JSON (sem markdown code blocks) com a seguinte estrutura:
    {
      "nome_popular": "Nome Popular",
      "nome_cientifico": "Nome Científico",
      "tipo_ferrao": "Com ferrão / Sem ferrão",
      "caracteristicas": "Texto curto com 2 características físicas visuais",
      "habitat": "Onde costuma nidificar e comportamento",
      "curiosidade_especial": "Fato interessante sobre mel ou polinização",
      "confianca_percentual": "Porcentagem estimada de certeza (0-100)"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as BeeAnalysisResult;
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}

import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  nome: string;
  categoria: string;
  detalhes: string;
  utilidade_ou_habitat: string;
  curiosidade: string;
  confianca: number;
}

function parseGeminiResponse(text: string): AnalysisResult {
  try {
    // Find the first '{' and the last '}'
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      throw new Error("No valid JSON object found in response");
    }

    const jsonString = text.substring(startIndex, endIndex + 1);
    return JSON.parse(jsonString) as AnalysisResult;
  } catch (error) {
    console.error("JSON Parse Error:", error, "Raw Text:", text);
    throw new Error("Falha ao processar os dados da imagem. A IA retornou um formato inválido.");
  }
}

export async function analyzeImage(base64Image: string): Promise<AnalysisResult> {
  // Remove the data URL prefix if present to get just the base64 string
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const prompt = `
    Atue como um especialista em reconhecimento visual.
    Analise esta imagem e identifique o objeto, animal, planta ou ser vivo principal.

    Seja preciso e forneça informações educativas e interessantes.

    Responda OBRIGATORIAMENTE apenas com um objeto JSON válido.
    NÃO use blocos de código Markdown.
    
    Siga estritamente esta estrutura JSON:
    {
      "nome": "Nome Popular do item",
      "categoria": "Categoria científica ou tipo do objeto",
      "detalhes": "Descrição visual curta com características marcantes",
      "utilidade_ou_habitat": "Habitat natural (se vivo) ou Utilidade principal (se objeto)",
      "curiosidade": "Um fato interessante ou científico sobre o item",
      "confianca": 99
    }
    
    O campo 'confianca' deve ser um número entre 0 e 100.
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

    return parseGeminiResponse(text);
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}

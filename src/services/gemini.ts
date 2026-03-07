import { GoogleGenAI } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AnalysisResult {
  nome: string;
  categoria: string;
  detalhes: string;
  utilidade_habitat: string;
  curiosidade: string;
  confianca: string;
}

export async function analyzeImage(base64Image: string): Promise<AnalysisResult> {
  // Remove the data URL prefix if present to get just the base64 string
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const prompt = `
    Atue como um especialista em reconhecimento de imagem (Biologia e Objetos Gerais).
    Analise esta imagem e identifique o objeto, animal, planta ou ser vivo principal.

    1. Se for uma **Abelha** ou inseto: Forneça dados biológicos precisos (espécie, ferrão, etc).
    2. Se for **Qualquer outra coisa** (objeto, outro animal, comida, paisagem): Identifique o que é e forneça informações relevantes sobre sua utilidade, origem ou características.

    Responda OBRIGATORIAMENTE apenas com um objeto JSON válido.
    NÃO use blocos de código Markdown (\`\`\`json ... \`\`\`).
    
    Siga estritamente esta estrutura JSON:
    {
      "nome": "Nome Popular do objeto ou ser vivo",
      "categoria": "Nome Científico (se vivo) ou Categoria do objeto (ex: Eletrônico, Utensílio)",
      "detalhes": "Descrição visual curta com 2 características marcantes",
      "utilidade_habitat": "Habitat natural (se vivo) ou Utilidade principal (se objeto)",
      "curiosidade": "Um fato interessante, histórico ou científico sobre o item",
      "confianca": "Porcentagem estimada de certeza (apenas números, 0-100)"
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

    // Robust JSON cleaning: Remove Markdown code blocks and whitespace
    const cleanJson = text.replace(/```json\n?|```/g, "").trim();

    try {
      return JSON.parse(cleanJson) as AnalysisResult;
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw Text:", text);
      throw new Error("Falha ao processar os dados da imagem. Tente novamente.");
    }
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}

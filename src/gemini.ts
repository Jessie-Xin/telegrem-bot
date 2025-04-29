import {GoogleGenAI} from "@google/genai";

import dotenv from "dotenv";
dotenv.config();
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

export const askGemini = async (prompt: string) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}]
            }
        });
        return response.text;
    } catch (error) {
        console.log("error", error);

        return "Gemini API Error";
    }
};

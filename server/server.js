require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const express = require("express")
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.use(cors());
app.use(express.json());

async function Organize(title, url) {
    const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",

            contents: `
                You are organizing a user's browser tabs.

                Determine the MAIN GENERAL TOPIC of this tab.

                Use broad categories such as:
                - School
                - Programming
                - Robotics
                - Game Development
                - Sports
                - Entertainment
                - Shopping
                - News
                - Finance
                - Travel
                - Social Media
                - Research

                BUT YOU CAN USE OTHER CATEGORIES SO DON'T RESTRICT YOURSELF

                Do NOT create overly specific categories.
                
                BUT you can use semi-specific but not TOO specific to the point where there is a new folder for every new tab.

                Like for example(Use this example and also integrate it into other categories not just the one the example is of) for entertainment depending on the context of title you can split it into:
                - Music
                - Comic book movies
                - TV Shows
                etc.

                Also if you can't determine a folder name that seems like it could fit a broader amount of tabs since like the tab has a vague name like : "It can't be..." (EXAMPLE SO REMEMBER TO APPLY TO OTHER SCENARIOS) send it to a folder called Other

                Tab title:
                ${title}

                Tab URL:
                ${url}

                Return only the category name.
                `,
            config: {
                thinkingConfig: {
                    thinkingLevel: "low"
                }
            }
        });

    return response.text.trim();
}

async function GeneratePageText(url){
    const response = await axios.get(url, {
        timeout: 5000,
        headers: {
            "User-Agent" : "Mozilla/5.0"
        }
    });

    const $ = cheerio.load(response.data);
    $("script, style, nav, footer, header").remove();
    const text = $("body").text();
    return text.replace(/\s+/g, " ").trim();
}

async function Generate_TabSummary(pageText, title) {
    const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",

            contents: `
                Based on the webpage text below, write a concise 2–3 sentence summary of the webpage.

                Title: ${title}

                Webpage text:
                ${pageText}

                If pagetext is empty or doesn't give details say, unable to generate summary
                Focus on the main topic, purpose, and most important information. Only use information supported by the provided webpage text. Do not make up or assume information that is not present. Do not mention that you are summarizing the text.
                        `,
            config: {
                thinkingConfig: {
                    thinkingLevel: "low"
                }
            }
        });

    return response.text.trim();
}

app.post("/organize", async (req, res) => {
    const {title, url} = req.body;

    try {
        const folder = await Organize(title, url);
        res.json({folder:folder});
    }catch(error){
        console.error(error);

    }
})

app.post("/summarize", async(req, res) => {
    const {title, url} = req.body;

    try {
        const pageText = await GeneratePageText(url);
        const tabSummary = await Generate_TabSummary(pageText, title);
        res.json({summary : tabSummary})
    }catch(error){
        console.error(error);
        res.status(500).json({error: "Unable to generate tab summary"});
    }
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
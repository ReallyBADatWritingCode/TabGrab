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

async function Register_UserMessage(message, tab_data){
    const readableTabData = JSON.stringify(tab_data ?? {}, null, 2);
    const response = await ai.models.generateContent({
        model : "gemini-3.1-flash-lite",
        contents : `Answer the user's message/question: ${message}

                Use the tab data to answer accurately. The savedAt field is the time the tab was saved to this dashboard, not the browser's original creation time. If a tab has no savedAt field, say that its save time was not recorded. Convert savedAt.date into a natural date and time when answering.

                    Tab data:
                    ${readableTabData}`,
        config: {
                thinkingConfig: {
                    thinkingLevel: "low"
                }
            }
    })
    return response.text.trim()
}

async function Connection_Create(tab_data){
    let connection_data = {}
    const response = await ai.models.generateContent({

        model: "gemini-3.1-flash-lite",

        contents: `
You are analyzing a collection of saved browser tabs.

Determine which tabs are meaningfully related based on their
titles, URLs, summaries, and other available information.

Return ONLY valid JSON in this format:

{
    "connections": [
        {
            "tab1": "URL OF TAB 1",
            "tab2": "URL OF TAB 2"
        }
    ]
}

Rules:
- Only include meaningful relationships.
- Do not connect unrelated tabs.
- Do not connect a tab to itself.
- Each relationship should only appear once.
- Use the exact URLs provided.
- If there are no meaningful relationships, return:
  {"connections":[]}

Saved tabs:

${readableTabData}
        `,

        config: {
            thinkingConfig: {
                thinkingLevel: "low"
            }
        }

    });
   const text = response.text.trim();
   console.log("AI connection response : ", text);
   const parsed = JSON.parse(text);
   return parsed.connections;
}

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
    if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error("Only HTTP and HTTPS URLs can be summarized");
    }

    const response = await axios.get(url, {
        timeout: 5000,
        headers: {
            "User-Agent" : "Mozilla/5.0"
        }
    });

    const $ = cheerio.load(response.data);
    const pageData = {
        url,
        title: $("title").text(),
        description: $("meta[name='description'], meta[property='og:description']").attr("content") || "",
        headings: $("h1, h2, h3").map((i, el) => $(el).text()).get(),
        paragraphs: $("p").map((i, el) => $(el).text()).get(),
        lists: $("li").map((i, el) => $(el).text()).get(),
        images: $("img").map((i, el) => ({
            alt: $(el).attr("alt"),
            src: $(el).attr("src")
        })).get(),
        videos: $("video").map((i, el) => ({
            src: $(el).attr("src")
        })).get()
    };
    return pageData;
}

async function Generate_TabSummary(pageData, title) {
    const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",

            contents: `
                Based on the webpage text below, write a concise 2–3 sentence summary of the webpage.
                NOT TOO LONG PLEASE(even if it is 2-3 sentences)
                Title: ${title}

                Webpage data:
                ${JSON.stringify(pageData)}

                If the page data is unavailable, give the best concise description possible from the title and URL. Do not respond with "unable to generate summary" unless both the title and URL are missing.
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

app.post("/connect", async (req, res) => {
    console.log("CONNECT REQUEST RECEIVED");

    const timeout = setTimeout(() => {

        console.error("CONNECT TIMED OUT");

        if (!res.headersSent) {
            res.status(504).json({
                error: "Connection generation timed out"
            });
        }

    }, 30000);
    const {tab_data} = req.body;
    try {
        const connection_data = await Connection_Create(tab_data);
        res.json({connection_data:connection_data});
    }catch(error){
        console.error(error);
    }
})

app.post("/organize", async (req, res) => {
    const {title, url} = req.body;

    try {
        const folder = await Organize(title, url);
        res.json({folder:folder});
    }catch(error){
        console.error(error);

    }
})

app.post("/chat", async(req, res) => {
    const {tab_data, message} = req.body;

    try { 
        const chat_response = await Register_UserMessage(message, tab_data);
        res.json({chat_response : chat_response})
    }catch(error){
        console.error(error);
        res.status(500).json({error: error.message || "Unable to generate chat response"});
    }
})

app.post("/summarize", async(req, res) => {
    const {title, url} = req.body;

    try {
        let pageData;
        try {
            pageData = await GeneratePageText(url);
        } catch (error) {
            console.warn(`[summarize] Could not fetch ${url}:`, error.message);
            pageData = {
                url: url || "",
                title: title || "",
                description: "",
                headings: [],
                paragraphs: [],
                lists: [],
                images: [],
                videos: [],
                fetchError: "The page could not be fetched; use the title and URL only."
            };
        }

        const tabSummary = await Generate_TabSummary(pageData, title);
        res.json({summary : tabSummary})
    }catch(error){
        console.error(error);
        res.status(500).json({error: error.message || "Unable to generate tab summary"});
    }
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENAI_API_KEY
});

const interviewReportSchema = z.object({
  title: z.string(),
  matchScore: z.number().min(0).max(100),

  technicalQuestions: z.array(z.object({
    question: z.string(),
    intention: z.string(),
    answer: z.string(),
  })).min(5),

  behavioralQuestions: z.array(z.object({
    question: z.string(),
    intention: z.string(),
    answer: z.string(),
  })).min(4),

  skillGaps: z.array(z.object({
    skill: z.string(),
    severity: z.enum(["low", "medium", "high"]),
  })).min(3),

  preparationPlan: z.array(z.object({
    day: z.number(),
    focus: z.string(),
    task: z.string(),
  })).min(5),
})

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

  const prompt = `
You are an expert interviewer.

Return ONLY valid JSON. No explanations. No text.

Follow this EXACT structure:

- "title" must be a string and always included
- "matchScore" must be between 0 and 100

{
  "matchScore": 85,
  "title": "Full Stack Developer",
  "technicalQuestions": [
    {
      "question": "string",
      "intention": "string",
      "answer": "string"
    }
  ],
  "behavioralQuestions": [
    {
      "question": "string",
      "intention": "string",
      "answer": "string"
    }
  ],
  "skillGaps": [
    {
      "skill": "string",
      "severity": "low | medium | high"
    }
  ],
  "preparationPlan": [
    {
      "day": 1,
      "focus": "string",
      "task": "string"
    }
  ]
}

RULES:
- Do NOT return strings where objects are required
- Do NOT skip any field
- matchScore must be a number (0–100)
- Generate at least:
  - 5 technicalQuestions (objects)
  - 4 behavioralQuestions (objects)
  - 3 skillGaps (objects)
  - 5 preparationPlan (objects)
- Be specific and realistic based on the resume and job description

DATA:

Resume:
${resume}

Self Description:
${selfDescription}

Job Description:
${jobDescription}
`;

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  async function generateWithRetry(prompt, retries = 4) {
    const models = [
      "gemini-3-flash-preview",
      "gemini-1.5-flash"
    ];

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const model of models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
            }
          });

          const text = response.text;

          if (!text) throw new Error("Empty response");

          const json = JSON.parse(text);
          const parsed = interviewReportSchema.safeParse(json);

          if (parsed.success) return parsed.data;

          throw new Error("Invalid schema response");

        } catch (err) {
          lastError = err;

          // Only retry on transient errors
          if (err.status === 503 || err.status === 429) {
            const wait = Math.pow(2, attempt) * 1000;
            console.log(`Model ${model} busy. Retry in ${wait}ms`);
            await delay(wait);
            continue;
          }

          // If JSON/schema issue → retry immediately with next model
          if (err.message.includes("JSON") || err.message.includes("schema")) {
            console.log(`Bad JSON from ${model}, trying fallback model`);
            continue;
          }

          // Unknown error → break early
          throw err;
        }
      }
    }

    throw new Error(`Failed after retries: ${lastError?.message}`);
  }

  const result = await generateWithRetry(prompt);
  return result;
  
}

async function generatePdfFromHtml(htmlContent) {
  const browser = await puppeteer.launch()
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" })

  const pdfBuffer = await page.pdf({
    format: "A4", margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm"
    }
  })

  await browser.close()

  return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

  const resumePdfSchema = z.object({
    html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
  })

  const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(resumePdfSchema),
    }
  })


  const jsonContent = JSON.parse(response.text)

  const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

  return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf };
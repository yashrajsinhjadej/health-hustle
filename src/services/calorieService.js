const estimateCaloriesFromImage = async (imageBuffer, mimeType) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
  
      if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
      }
  
      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
  
      // Prepare the prompt
      const prompt = `Estimate the type of food shown in the image and provide a reasonable estimate of the total calorie count for the portion size visible. Respond ONLY with a JSON object containing the fields: 'foodDescription' (string) and 'estimatedCalories' (number). Do not include any other text or markdown formatting.`;
  
      // API URL - Use gemini-1.5-flash-latest or gemini-1.5-pro-latest
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "foodDescription": { "type": "STRING" },
              "estimatedCalories": { "type": "NUMBER" }
            },
            required: ["foodDescription", "estimatedCalories"]
          }
        }
      };
  
      // Call the Gemini API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
  
      if (!response.ok) {
        const errorDetails = await response.text();
        console.error("Gemini API Error:", response.status, errorDetails);
        throw new Error("Failed to connect to the Calorie Estimation Service.");
      }
  
      const result = await response.json();
  
      // Extract and parse the structured JSON response
      let geminiJsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
      if (!geminiJsonText) {
        throw new Error("AI failed to return valid JSON output.");
      }
  
      const estimation = JSON.parse(geminiJsonText);
      const { foodDescription, estimatedCalories } = estimation;
  
      return {
        foodDescription,
        estimatedCalories
      };
  
    } catch (error) {
      console.error('Error in Gemini API call:', error);
      throw new Error('Failed to process image with Gemini API: ' + error.message);
    }
  };
  
  module.exports = { estimateCaloriesFromImage };
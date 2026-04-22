

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verify() {
  console.log("Waiting for servers to be up...");
  await sleep(3000);

  const baseUrl = "http://localhost:5000/api";
  
  // 1. Register manager
  console.log("1. Registering Manager...");
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Manager", email: `manager_${Date.now()}@test.com`, password: "password123" })
  });
  const regData = await regRes.json();
  if (!regData.ok) {
    console.error("Register failed", regData);
    process.exit(1);
  }
  const token = regData.token;
  console.log("Manager registered successfully.");

  // 2. Add consultant
  console.log("2. Adding Consultant...");
  const consRes = await fetch(`${baseUrl}/consultants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ name: "Test Consultant", email: `consultant_${Date.now()}@test.com` })
  });
  const consData = await consRes.json();
  if (!consData.ok) {
    console.error("Add Consultant failed", consData);
    process.exit(1);
  }
  const consultantId = consData.consultant.id;
  console.log("Consultant added:", consultantId);

  // 3. Manual Script Analysis
  console.log("3. Testing Manual Script Analysis...");
  const scriptText = `
    Consultant: Hello Acme Corp team, thanks for joining. Are there any questions?
    Client: Yes, how does pricing work?
    Consultant: Pricing is simple. That's all.
  `;
  const analysisRes = await fetch(`${baseUrl}/analysis-reports/manual-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ script: scriptText, consultantId })
  });
  const analysisData = await analysisRes.json();
  if (!analysisData.ok) {
    console.error("Manual Script Analysis failed", analysisData);
    process.exit(1);
  }

  console.log("Analysis Output:", JSON.stringify(analysisData, null, 2));
  
  if (!analysisData.analysis.clientName && !analysisData.analysis.tips) {
    console.error("clientName or tips missing!", analysisData.analysis);
    process.exit(1);
  }
  
  if (!analysisData.scores) {
    console.error("scores missing!", analysisData);
    process.exit(1);
  }
  
  console.log("VERIFICATION SUCCESS");
}

verify().catch(console.error);

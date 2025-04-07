const express = require("express");
const fetch = require("node-fetch").default;

const app = express();
app.use(express.json());

const ORIGIN8CARES_UAT_URL = "https://gateway-private.uat.o8cares.com/federated-gql";
const CLIENT_ID = "M7R0ttD3yy9kgjXtHrZBzt47SqnHjex4";
const CLIENT_SECRET = "nB0-AzEW6aHyiqIiZAchkNEsZcC9gjsIeRVuzjfuYzETAdh3JMeKihny4qG4Sg12";

async function getAuthToken() {
    try {
        const response = await fetch(ORIGIN8CARES_UAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: "mutation OauthToken($credentials: OAuthInput!) { oauthToken(credentials: $credentials) { access_token token_type } }",
                variables: { credentials: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } },
                operationName: "OauthToken"
            })
        });
        
        const data = await response.json();
        if (!data.data || !data.data.oauthToken) {
            throw new Error("Invalid Auth Response");
        }
        return data.data.oauthToken.access_token;
    } catch (error) {
        console.error("\n🚨 Error fetching Origin8Cares auth token:", error.message);
        throw new Error("Authentication Failed");
    }
}

app.post("/warm-transfer", async (req, res) => {
    try {
        let { callerId, UUID, state, postalCode } = req.body;

        if (!callerId || !UUID || !state || !postalCode) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        callerId = callerId.replace(/\D/g, "");
        if (callerId.length === 9) callerId = "0" + callerId;
        if (callerId.length !== 10) {
            return res.status(400).json({ error: "Invalid callerId format" });
        }

        console.log(`\n✅ Processing Warm Transfer for Caller ID: ${callerId}, UUID: ${UUID}, State: ${state}`);
        
        const authToken = await getAuthToken();

        console.time("Warm Transfer Request Time");
        const warmTransferRequest = await fetch(ORIGIN8CARES_UAT_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json",
                "Idempotency-Key": UUID
            },
            body: JSON.stringify({
                query: "mutation WarmTransferRequest($warmTransferRequestWarmTransferPayload: WarmTransferPayload) { warmTransferRequest(warmTransferPayload: $warmTransferRequestWarmTransferPayload) { available errorMessage leadReferenceUuid } }",
                variables: {
                    warmTransferRequestWarmTransferPayload: {
                        leadDetails: {
                            ani: callerId,
                            phone: callerId,
                            stateFromAd: state,
                            country: "USA",
                            postalCode: postalCode
                        }
                    }
                },
                operationName: "WarmTransferRequest"
            })
        });
        console.timeEnd("Warm Transfer Request Time");
        
        const warmTransferResponse = await warmTransferRequest.json();
        console.log("\n📥 Warm Transfer Request Response:", JSON.stringify(warmTransferResponse, null, 2));

        const available = warmTransferResponse?.data?.warmTransferRequest?.available || false;
        const leadReferenceUuid = warmTransferResponse?.data?.warmTransferRequest?.leadReferenceUuid || null;

        if (!available || !leadReferenceUuid) {
            console.log("\n❌ No agents available for warm transfer.");
            return res.json({ allowCall: false });
        }

        console.log(`\n✅ Agent Available. Confirming Warm Transfer with Lead UUID: ${leadReferenceUuid}`);

        console.time("Warm Transfer Confirmation Time");
        const warmTransferConfirm = await fetch(ORIGIN8CARES_UAT_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json",
                "Idempotency-Key": leadReferenceUuid
            },
            body: JSON.stringify({
                query: "mutation WarmTransferConfirm($warmTransferConfirmationPayload: WarmTransferConfirmationPayload) { warmTransferConfirm(warmTransferConfirmationPayload: $warmTransferConfirmationPayload) { result } }",
                variables: {
                    warmTransferConfirmationPayload: {
                        leadDetails: {
                            ani: callerId,
                            phone: callerId,
                            stateFromAd: state,
                            country: "USA",
                            postalCode: postalCode
                        },
                        leadReferenceUuid: leadReferenceUuid,
                        transferred: true
                    }
                },
                operationName: "WarmTransferConfirm"
            })
        });
        console.timeEnd("Warm Transfer Confirmation Time");
        
        const confirmResponse = await warmTransferConfirm.json();
        console.log("\n📥 Warm Transfer Confirmation Response:", JSON.stringify(confirmResponse, null, 2));

        const result = confirmResponse?.data?.warmTransferConfirm?.result || "CANCELLED";

        console.log(`\n✅ Warm Transfer Confirmation Result: ${result}`);
        res.json({ allowCall: result === "TRANSFERRED", leadReferenceUuid });
    } catch (error) {
        console.error("\n🚨 Unhandled Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`\n🚀 Warm Transfer Server running on port ${PORT}`));

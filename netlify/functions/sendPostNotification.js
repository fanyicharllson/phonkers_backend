const fetch = globalThis.fetch || require("node-fetch");
const { GoogleAuth } = require("google-auth-library");

const getAccessToken = async () => {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey)
    throw new Error("Missing Firebase service account key");

  const auth = new GoogleAuth({
    credentials: JSON.parse(serviceAccountKey),
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  return await auth.getAccessToken();
};

const sendFCMv1Notification = async (projectId, accessToken, message) => {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`FCM API error: ${JSON.stringify(err)}`);
  }

  return await res.json();
};

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { content, author, postId, authorId } = JSON.parse(event.body || "{}");
    if (!content) {
      return { statusCode: 400, body: "Missing content" };
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const accessToken = await getAccessToken();

    const message = {
      topic: "trending-phonks", // ✅ all subscribed users get notified
      notification: {
        title: `${author || "Phonkers"} posted 🎵`,
        body: content.length > 50 ? content.substring(0, 50) + "..." : content,
      },
      data: {
        type: "new_post",
        postId,
        postContent: content,
        postAuthor: author || "Anonymous",
        postAuthorId: authorId || "",
        // For debugging
        timestamp: new Date().toISOString(),
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    };

    const result = await sendFCMv1Notification(projectId, accessToken, message);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result }),
    };
  } catch (err) {
    console.error("❌ sendPostNotification error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

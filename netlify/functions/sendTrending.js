const fetch = globalThis.fetch || require("node-fetch");
const { GoogleAuth } = require("google-auth-library");

console.log("YOUTUBE_API_KEY:", !!process.env.YOUTUBE_API_KEY);
console.log("FIREBASE_PROJECT_ID:", !!process.env.FIREBASE_PROJECT_ID);
console.log("FIREBASE_SERVICE_ACCOUNT_KEY:", !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
try {
  const parsed = JSON.parse(key);
  console.log('✅ JSON is valid!', parsed.project_id);
} catch (error) {
  console.log('❌ JSON error:', error.message);
}

// YouTube API service functions (same as before)
const searchYouTubeVideos = async (query, maxResults = 8) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {                            
    throw new Error("YouTube API key not configured");
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
    query
  )}&type=video&maxResults=${maxResults}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
};

const createPhonkFromYouTube = (video) => {
  const snippet = video.snippet;
  const title = snippet.title;

  let artist = snippet.channelTitle;
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    artist = parts[0].trim();
  }

  return {
    id: video.id.videoId,
    title: title,
    artist: artist,
    thumbnail:
      snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
    source: "youtube",
  };
};

const getTrendingPhonks = async (limit = 10) => {
  try {
    let allPhonks = [];
    const queries = [
      "phonk trending 2025",
      "drift phonk",
      "LXNGVX",
      "popular phonk music",
      "memphis phonk",
    ];

    for (const query of queries) {
      console.log(`Searching YouTube for: ${query}`);
      const youtubeResults = await searchYouTubeVideos(query, 8);

      for (const video of youtubeResults) {
        if (video.id?.videoId) {
          allPhonks.push(createPhonkFromYouTube(video));
        }
      }

      if (allPhonks.length >= limit) break;
    }

    // Deduplicate
    const seen = new Set();
    allPhonks = allPhonks.filter((phonk) => {
      const key = `${phonk.title}-${phonk.artist}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Shuffle
    for (let i = allPhonks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPhonks[i], allPhonks[j]] = [allPhonks[j], allPhonks[i]];
    }

    return allPhonks.slice(0, limit);
  } catch (error) {
    console.error("Error fetching trending phonks:", error);
    return [];
  }
};

// Modern FCM v1 API function
const getAccessToken = async () => {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("Firebase service account key not configured");
  }

  const auth = new GoogleAuth({
    credentials: JSON.parse(serviceAccountKey),
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const accessToken = await auth.getAccessToken();
  return accessToken;
};

const sendFCMv1Notification = async (projectId, accessToken, message) => {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`FCM v1 API error: ${JSON.stringify(error)}`);
  }

  return await response.json();
};

// Main Netlify function handler
exports.handler = async function (event, context) {
  try {
    // Fetch trending phonks
    console.log("Fetching trending phonks...");
    const trendingPhonks = await getTrendingPhonks(5);

    if (trendingPhonks.length === 0) {
      console.log("No trending phonks found, skipping notification");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No trending phonks found" }),
      };
    }

    const topPhonk = trendingPhonks[0];
    const notificationBody = `${topPhonk.artist} - ${topPhonk.title}`;

    // Get Firebase project ID and access token
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error("Firebase project ID not configured");
    }

    const accessToken = await getAccessToken();

    // Prepare FCM v1 message
    const message = {
      topic: "trending-phonks",
      notification: {
        title: "🔥 New Trending Phonk",
        body: notificationBody,
      },
    data: {
      phonkId: topPhonk.id,
      phonkTitle: topPhonk.title,
      phonkArtist: topPhonk.artist,
      phonkThumbnail: topPhonk.thumbnail || "",
      timestamp: new Date().toISOString(),
      totalTrending: trendingPhonks.length.toString(),
      iconUrl: topPhonk.thumbnail,
      clickAction: "FLUTTER_NOTIFICATION_CLICK",
    },
    // Android-specific styling
    android: {
      notification: {
        icon: 'background',
        color: '#FF6B35', // Notification color
        sound: 'default'
      }
    },
    // iOS-specific styling  
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    }
  }; // <-- Correctly close the message object here

  // Send notification using FCM v1 API
  const result = await sendFCMv1Notification(projectId, accessToken, message);

    console.log("Notification sent successfully:", result);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result }),
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

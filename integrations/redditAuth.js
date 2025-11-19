import axios from "axios";

let cachedToken = null;
let tokenExpiry = null;

export const getRedditAccessToken = async () => {
  // Return cached token if still valid
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  const response = await axios.post(
    "https://www.reddit.com/api/v1/access_token",
    "grant_type=client_credentials",
    {
      auth: {
        username: clientId,
        password: clientSecret,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  cachedToken = response.data.access_token;
  // Token expires in 'expires_in' seconds
  tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000 - 60000); // minus 1 min buffer

  return cachedToken;
};

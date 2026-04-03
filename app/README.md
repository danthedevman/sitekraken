# Express Workspaces OpenAI Auth0 Export

Small Express MVC app with:

- ESM modules
- Express + EJS + express-ejs-layouts
- Bootstrap 5
- Auth0 authentication via Passport.js
- MongoDB official Node.js driver (no Mongoose)
- Workspaces
- OpenAI file uploads and vector store attachment
- Markdown knowledge entries with publish-to-file flow
- Chatbot config UI
- Allowed domains list per chatbot
- Copyable script tag with `src` and `data-api-key` created per workspace

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Auth0

Set the callback URL in Auth0 to:

```txt
http://localhost:4000/auth/callback
```

## MongoDB

This app uses the official MongoDB Node.js driver. Set:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=workspaces_app
```

## OpenAI Notes

The app:
1. Creates a vector store when a workspace is created
2. Uploads regular files to OpenAI Files
3. Attaches those files to the workspace vector store
4. Saves knowledge entries as Markdown files and uploads those too when published

## Chatbot Embed

Each workspace gets an API key and a copyable script tag like:

```html
<script src="http://localhost:4001/public/lib/chat.js" data-api-key="WORKSPACE_KEY"></script>
```

## Important production follow-ups

- verify `data-api-key` against the saved workspace chatbot config
- enforce the `allowedDomains` list in your chatbot runtime or API layer
- add CSRF protection
- add stronger cookie settings and secure session store
- validate upload types and size limits
- add pagination and search

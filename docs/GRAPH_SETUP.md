## Microsoft Graph / Teams setup (starter)

This repo includes a stub `GraphService` in `backend/services/graphService.js`.

### 1) Create an Azure AD app registration

In Azure portal:

- **Azure Active Directory** → **App registrations** → **New registration**
- Record:
  - **Directory (tenant) ID** → `AZURE_TENANT_ID`
  - **Application (client) ID** → `AZURE_CLIENT_ID`

Create a **client secret**:

- **Certificates & secrets** → **New client secret**
- Record value as `AZURE_CLIENT_SECRET`

### 2) Permissions

Depending on your approach (app-only vs delegated), you’ll need appropriate Graph permissions.
For online meetings, common permissions include:

- `OnlineMeetings.Read.All`

Admin consent may be required.

### 3) Implement token acquisition

Update `backend/services/graphService.js`:

- Implement **client credentials** flow to get an access token for scope `https://graph.microsoft.com/.default`
- Use that token to call Graph endpoints (e.g. `GET /users/{id | userPrincipalName}/onlineMeetings`)

### 4) Test

Start backend and call:

- `GET /api/teams/meetings?userPrincipalName=you@domain.com&start=...&end=...`

You should return real Graph data once implemented.

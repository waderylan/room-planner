# Shared layout invitations

- `ShareDialog` publishes one to four immutable design snapshots and returns an invite link. Creating another invitation creates a new snapshot; votes never move to a revised layout silently.
- `SharedLayoutPage` displays measured SVG plans without mounting the editable document canvas. Visitors can switch options and rooms without joining.
- A display name is requested only when a visitor votes or comments. One invitation identity gets one replaceable vote. This identifies a browser participant, not a verified person.
- Comments retry with the same client identifier to prevent duplication after a network failure. Refresh polls every eight seconds while the page is visible.
- Creator and participant capabilities stay in device-local storage, separate from design documents. Management secrets never appear in invite URLs or public API responses. If storage fails, the UI reports that management or identity is available only in the current tab.
- The creator can revoke access from the creating device. Invitations expire after 30 days. Copying an option creates an independent local design.
- Persistent SQL quotas cap the service at 500 active invitations, 500 participants per invitation, and 200 comments per invitation. Conditional inserts enforce these limits across concurrent requests. Creation removes expired and revoked invitations with their feedback.

`src/sharing/client.ts` validates remote snapshots before rendering or copying. `server/sharing/handler.ts` validates requests, checks capabilities, and writes through the shared SQLite/D1 adapter. Schema initialization belongs to local startup or deployed migrations; request handlers never create tables.

The API requires a reachable hosted service for sharing across devices. GitHub Pages alone cannot persist shared votes or comments.

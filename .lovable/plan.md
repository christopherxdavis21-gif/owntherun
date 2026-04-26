## Publishing your app

To get your app live for testing, you'll publish it directly from the Lovable editor — this is a one-click action you control, not something I run for you.

### How to publish

**Desktop:** Click the **Publish** button in the top-right of the editor → click **Publish** (or **Update** if you've published before).

**Mobile:** Tap the **…** button in the bottom-right of the Preview screen → **Publish**.

This will give you a live URL like `your-project.lovable.app` that you can open on any device (phone, tablet, desktop) to test the app — including the GPS tracking, route creation, map views, and email verification flow you've built.

### What I'll do to support testing

Once you've clicked Publish, here are a couple of things I can help verify or adjust if needed:

1. **Confirm publish visibility is public** — so your testers don't hit a login wall. I can check this with the publish settings tool and flip it to public if it's currently private.
2. **Check the 'Edit with Lovable' badge** — let me know if you want it hidden on the published site (requires a paid plan).
3. **Verify auth redirect URLs** — the email verification links need to point to your published domain, not the preview domain. After you publish, I'll confirm the Site URL and redirect allow-list in your backend auth settings include the new `.lovable.app` URL so verification emails work correctly for testers.

### Things to know before testing

- **Frontend changes** you make later require clicking **Update** in the publish dialog to push them live.
- **Backend changes** (database, edge functions) deploy automatically — no extra step.
- **Geolocation and notifications** require HTTPS, which the published `.lovable.app` URL provides automatically.

### After you approve

Once approved, I'll:
1. Check current publish visibility and confirm it's set to public.
2. After you've clicked Publish, verify the auth redirect URLs include the live domain so email verification works for testers.
3. Flag anything else that might trip up testers (e.g., location permission prompts on iOS Safari).

Click **Publish** in the editor when you're ready, and approve this plan so I can run the verification steps.
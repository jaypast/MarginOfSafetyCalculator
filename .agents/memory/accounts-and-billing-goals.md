---
name: Accounts and billing goals
description: Owner requirements for free launch, future subscriptions, personal watchlists, and administration.
---

The user wants a backend to manage this site, with full owner admin rights and reporting. Each person should be able to save their own list of stocks to track.

The user wants to keep the site free for now, but eventually charge users for unlimited use, with yearly or monthly payments. Their billing requirement is: "Billing must be safe and secure - I don't want to store that data."

For the current accounts and administration work, the user chose "Add billing later": build accounts, personal watchlists, owner administration, and usage reporting now, without payment integration.

**Why:** These are explicit product requirements from the owner.

**How to apply:** Build account-owned stock lists and owner administration first. When billing is requested later, clarify what payment metadata is necessary and keep sensitive payment details with the billing provider. Do not implement payment collection as part of the free-launch foundation or activate charging without the owner's chosen pricing and approval.

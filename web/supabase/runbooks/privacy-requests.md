# Privacy requests: export and deletion

Customers ask for a copy of their data, or for it to be deleted, from **Dashboard → Profile**. Each request:
- is emailed to the privacy address (`LEGAL_CONFIG.privacyEmail`), with a request ID such as `tdpsa_1a2b3c4d5e`
- is recorded in `admin_audit_logs` (action `tdpsa_privacy_request`)

Answer within 45 days. Work in the Supabase **SQL Editor** for the production project. The customer ID is in the email.

## Export request

1. Run:
   ```sql
   select export_customer_data('<customer id>');
   ```
2. Copy the result (one JSON document) into a file named `first-eleven-data-<request id>.json`.
   It holds the customer's details, preferences, addresses, orders with items, history and photo records, claims and messages.
3. Email the file to the customer's address on file, from the privacy address. Reply only to that address, never to a different one given in the request.
4. Photos are links to private files. If the customer wants the images, download them from **Storage** (paths are in `orders[].photos[].photo_url` and `claims[].photo_urls`) and attach them.

## Deletion request

The orders stay, with their amounts, because they are tax records. Everything that identifies the person is removed.

1. Check the customer has no order in progress. The function refuses if one is not yet delivered or cancelled.
2. (Optional) Run the export first and keep it only until step 4 is done, in case something goes wrong.
3. Run:
   ```sql
   select anonymize_customer('<customer id>', '<request id>');
   ```
   It removes:
   - name, email and phone
   - SMS consent
   - street, unit and delivery notes (city, state and ZIP stay)
   - preferences and gate code
   - conversations
   - order notes
   - the link to the saved card
   - claim descriptions
   - photo records

   It also writes a `customer_anonymized` row to `admin_audit_logs`. The result lists what you must still delete by hand:
   - `delete_login_user_id`: **Authentication → Users**, find that ID, then **Delete user**. If the value is null, the customer had no login.
   - `delete_square_customer_id`: in the **Square Dashboard → Customers**, open that customer and delete it. Saved cards are removed with it.
   - `delete_photo_files`: in **Storage**, delete each file. The part after `/object/public/` is `<bucket>/<path>`. Files for one order share a folder named after the order ID, so you can delete the whole folder.
4. Reply to the customer, from the privacy address, that their data has been deleted.

A staff account is refused. Remove the person on the Mission Control **Staff** screen first.

## Photo retention

How long doorstep and garment photos are kept is still to be decided by the owner. Until then, photos are kept until a deletion request.

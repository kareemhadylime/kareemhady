-- Seed the default WhatsApp reservation notification settings.
-- The UI (Settings > Notifications) manages this via the beithady_settings KV store.
-- Both groups default to disabled=false so no messages fire until explicitly enabled.

insert into public.beithady_settings (key, value, description)
values (
  'wa_reservation_notifications',
  '{
    "groups": [
      {
        "id": "admin_guestrel",
        "label": "Admin & Guest Relations",
        "template": "full",
        "enabled": false,
        "phones": []
      },
      {
        "id": "operations",
        "label": "Operations",
        "template": "ops",
        "enabled": false,
        "phones": []
      }
    ]
  }'::jsonb,
  'WhatsApp notification targets for new confirmed reservations. Managed via Settings > Notifications.'
)
on conflict (key) do nothing;

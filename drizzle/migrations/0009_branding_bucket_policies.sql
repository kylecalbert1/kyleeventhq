CREATE POLICY "Staff read branding assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'branding');

CREATE POLICY "Staff upload branding assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding');

CREATE POLICY "Staff update branding assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding') WITH CHECK (bucket_id = 'branding');

CREATE POLICY "Staff delete branding assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding');
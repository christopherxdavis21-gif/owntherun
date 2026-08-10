DROP POLICY IF EXISTS "Group owners can upload group photos" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can update group photos" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can delete group photos" ON storage.objects;

CREATE POLICY "Group owners can upload group photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group owners can update group photos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group owners can delete group photos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'group-photos'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE (g.id)::text = (storage.foldername(name))[1]
      AND g.created_by = auth.uid()
  )
);
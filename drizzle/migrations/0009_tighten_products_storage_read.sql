DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;

CREATE POLICY "Anyone can view product images" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'products'
  AND (
    name ~ '^(M|L|XL|XXL)/'
    OR name LIKE 'pajama/products/%'
    OR name LIKE 'sneakers/products/%'
    OR name LIKE 'sweatshirt/products/%'
    OR name LIKE 'sweatshirt-combo/products/%'
    OR name LIKE 'hoodie-combo/products/%'
    OR name LIKE 'site/%'
  )
);
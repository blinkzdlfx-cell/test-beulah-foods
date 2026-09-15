-- Increase product image bucket size from 5 MB to 10 MB.
-- Keeps staging and future environments reproducible.

UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'product-images';

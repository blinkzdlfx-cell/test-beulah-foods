-- Add featured product support.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.is_featured IS
'Whether the product is featured on the storefront.';

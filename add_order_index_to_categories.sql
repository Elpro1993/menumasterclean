-- This script adds an 'order_index' column to the 'categories' table
-- to allow for custom ordering of categories.

ALTER TABLE public.categories
ADD COLUMN order_index INTEGER;

-- Note: After running this, you should update your application logic
-- to set and manage the order_index for new and existing categories.
-- Existing categories will have a NULL value for order_index until it is set.

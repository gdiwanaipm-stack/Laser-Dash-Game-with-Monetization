-- Remove any orphaned orders so the NOT NULL can be applied safely
DELETE FROM public.orders WHERE user_id IS NULL;
ALTER TABLE public.orders ALTER COLUMN user_id SET NOT NULL;
-- Creates a new row in the public.profiles table when a new user signs up.
-- This function is designed to be called by a trigger on the auth.users table.

-- 1. Define the function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert a new row into the profiles table
  -- The 'id' is the user's ID from auth.users
  -- The 'restaurant_name' and 'phone_number' are extracted from the raw_user_meta_data JSON
  INSERT INTO public.profiles (id, restaurant_name, phone_number, user_name)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'restaurant_name',
    new.raw_user_meta_data ->> 'phone_number',
    new.raw_user_meta_data ->> 'user_name'
  );
  RETURN new;
END;
$$;

-- 2. Define the trigger
-- This trigger calls the handle_new_user function every time a new user is created.
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

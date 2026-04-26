
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by everyone authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Routes table
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  distance_meters NUMERIC NOT NULL DEFAULT 0,
  -- coordinates: array of {lng, lat} stored as JSONB
  coordinates JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View public routes or own routes"
  ON public.routes FOR SELECT TO authenticated
  USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Insert own routes"
  ON public.routes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own routes"
  ON public.routes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Delete own routes"
  ON public.routes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_routes_user ON public.routes(user_id);
CREATE INDEX idx_routes_public ON public.routes(is_public) WHERE is_public = true;

-- Runs table
CREATE TABLE public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  duration_seconds INTEGER NOT NULL,
  distance_meters NUMERIC NOT NULL,
  notes TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- View runs that are on public routes (for leaderboards) or own runs
CREATE POLICY "View runs on public routes or own runs"
  ON public.runs FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.routes r
      WHERE r.id = runs.route_id AND r.is_public = true
    )
  );
CREATE POLICY "Insert own runs"
  ON public.runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own runs"
  ON public.runs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Delete own runs"
  ON public.runs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_runs_user ON public.runs(user_id);
CREATE INDEX idx_runs_route ON public.runs(route_id);
CREATE INDEX idx_runs_route_duration ON public.runs(route_id, duration_seconds);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

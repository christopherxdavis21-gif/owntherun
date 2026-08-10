DROP POLICY IF EXISTS "Anyone can view user achievements" ON public.user_achievements;
CREATE POLICY "Users can view own achievements"
ON public.user_achievements FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view medals" ON public.medals;
CREATE POLICY "Users can view own medals"
ON public.medals FOR SELECT TO authenticated
USING (user_id = auth.uid());
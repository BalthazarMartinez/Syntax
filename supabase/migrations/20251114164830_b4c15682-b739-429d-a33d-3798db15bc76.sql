-- Add UPDATE policy so users can persist webhook results on inputs
CREATE POLICY "Users can update inputs for their opportunities"
ON public.inputs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = inputs.opportunity_id
      AND (o.responsible_user_id = auth.uid() OR o.created_by = auth.uid())
  )
)
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = inputs.opportunity_id
      AND (o.responsible_user_id = auth.uid() OR o.created_by = auth.uid())
  )
);

-- Payments are gone: nobody needs to call the plan, payment or redeem-code functions any more.
revoke execute on function
  public.cvc_redeem(text),
  public.cvc_set_plan(text),
  public.cvc_submit_manual_payment(text, int, text, text, text),
  public.cvc_admin_review_payment(uuid, boolean),
  public.cvc_admin_payments(int),
  public.cvc_admin_codes(),
  public.cvc_admin_create_codes(text, int, int, int, timestamptz, text),
  public.cvc_admin_set_code_active(text, boolean),
  public.cvc_admin_set_auto(boolean),
  public.cvc_admin_auto_status(),
  public.cvc_admin_grant(uuid, text, int)
from public, anon, authenticated;

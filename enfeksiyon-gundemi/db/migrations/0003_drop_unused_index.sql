-- Kullanılmayan dizin: her kayıtta fazladan bir satır yazımına yol açıyordu
-- (Cloudflare D1 ücretsiz katmanı günde 100.000 satır yazmaya izin verir).
DROP INDEX IF EXISTS idx_works_pub_date;

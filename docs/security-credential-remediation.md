# Kimlik bilgisi sızıntısı — durum ve kurtarma planı

**Tarih:** 2026-10-16
**Depo:** `https://github.com/ByItachi/prozone` (`origin`, `master` ile senkron)
**Kapsam:** test/demo hesabının parolası (`prozonetest2`) ve varsayılan admin parolası.

> Bu doküman sızan parolaların **kendisini içermez**. Değerler `git`-dışı bir kaynaktan
> (parola yöneticisi, güvenli not) alınmalıdır; komutlarda kabuk değişkeni kullanın ki
> değerler kabuk geçmişine (`.bash_history`, `$HISTFILE`) düşmesin.

```bash
# Örnek: değerleri oturum boyunca ortamdan verin (dosyaya YAZMAYIN)
read -rs OLD_ADMIN_PASSWORD && export OLD_ADMIN_PASSWORD   # sızan admin parolası
read -rs LEAKED_DEMO_PASSWORD && export LEAKED_DEMO_PASSWORD # sızan demo parolası
```

## 1. Ne sızdı, nerede

| # | Sızıntı | Konum | Durum |
|---|---|---|---|
| 1 | Demo hesabı (`prozonetest2`) + parolası | `apps/web/app/login/page.tsx` — **HEAD'de ve ilk commit'ten (`9c6acba`) beri geçmişte**, `origin/master`'a push edilmiş | Çalışma ağacından kaldırıldı, **geçmiş temizlenmedi** |
| 2 | Admin parolası (10 karakter, `A…4!`) | `.env.example`, `packages/config/src/index.ts` (zod default), `packages/db/prisma/seed.ts` (sabit hash) | Kaynaktan kaldırıldı, **canlı admin hesabının parolası hâlâ bu** |
| 3 | Eski parola metni | `apps/web/.next/` içindeki 6 derleme dosyası (webpack cache + hot-update chunk) | Dizinde duruyor (gitignore'lu, commit'lenmiyor) |
| 4 | `change-me-*` JWT secret'ları | `.env` (gitignore'lu, commit'lenmiyor) | Rotasyon bekliyor |

Sızan iki parola bu repodaki iki ayrı hesaba ait: #1 demo kullanıcısı (`USER`), #2 ise çalışan bir `SUPER_ADMIN` hesabı (`admin@prozone.st`).

## 2. Şu ana kadar yapılanlar (doğrulandı)

- `login/page.tsx`: test hesabı ipucu bloğu ve tıklama handler'ı silindi (`0 ekleme / 14 silme`); kaynakta ve sunulan HTML'de dize yok.
- Demo hesabı veritabanından kaldırıldı: 32 açık oturum iptal (`revokedAt`), 2FA kaydı silindi, `deletedAt` set edildi, parola hash'i rastgele argon2 hash ile değiştirildi. Eski parolayla giriş → **401**.
- Varsayılan admin parolası kaynaktan çıkarıldı:
  - `packages/config/src/index.ts`: `ADMIN_PASSWORD` artık varsayılansız (`optional`; boş string = tanımsız).
  - `packages/db/prisma/seed.ts`: parola yalnızca **ilk admin oluşturulurken** `ADMIN_PASSWORD`'dan okunuyor, 12 karakterden kısa ise seed net bir hatayla duruyor; var olan admin'in kimlik bilgileri asla yeniden yazılmıyor. İzole bir geçici veritabanında doğrulandı: yeni admin güçlü parolayla oluştu, eski varsayılan parola doğrulanmadı.
  - `.env.example`: `ADMIN_PASSWORD=` (boş, açıklamalı).
  - `packages/db`: `db:seed` artık kök `.env`'i yükleyen `tsx --env-file=../../.env prisma/seed.ts` (Prisma CLI `.env`'i şema yanında aradığı için eski komut `DATABASE_URL` bulamıyordu).
- **Admin parolası rotate edildi (2026-10-16):** sızan parolayla giriş artık **401**, yeni parolayla **200**. Yeni değer reponun dışında `C:\Users\root\prozone-admin-password.txt` dosyasında (yalnızca senin makinende); parola yöneticine taşıdıktan sonra bu dosyayı sil.
- Yerel `.env`'deki ölü `ADMIN_PASSWORD` değeri boşaltıldı (seed mevcut admin'in kimlik bilgilerini yeniden yazmaz).
- **JWT secret'ları rotate edildi (2026-10-16):** `change-me-*` placeholder'lar yerine 64 karakterlik rastgele değerler (`pnpm secrets:rotate-jwt`, değerler hiç yazdırılmaz). Geçici bir API örneği üzerinde kanıtlandı: yeni token'ın imzası yeni `JWT_ACCESS_SECRET` ile doğrulanıyor, eski placeholder ile doğrulanmıyor.
- Önleme: `scripts/scan-secrets.mjs` (dosya + `--staged` + `--history`), `scripts/rotate-jwt-secrets.mjs`, `.githooks/pre-commit` (bu klonda `core.hooksPath=.githooks` olarak etkin) + `.github/workflows/secret-scan.yml`.

## 3. Açık kalan riskler

1. ~~Sızan admin parolası hâlâ geçerli~~ — **kapatıldı:** parola rotate edildi, eski değer 401 dönüyor (bkz. Adım 1, yapıldı).
2. **Geçmiş temizlenmedi:** demo parolası tüm commit'lerde ve GitHub'da; fork/klon/PR yorumlarında kalmış olabilir.
3. ~~JWT secret'ları zayıf placeholder~~ — **kapatıldı:** 64 karakterlik rastgele değerlerle değiştirildi. **Halâ açık olan kısım:** çalışan API örneği (localhost:4000) yeni secret'ları ancak yeniden başlatılınca okur; o ana kadar eski token'lar geçerlidir.
4. **`.next` cache'i eski parolayı taşıyor:** bu dizin bir dağıtım paketine/servise sızarsa parola metni gider.

## 4. Kurtarma planı

### Adım 1 — Canlı admin parolasını değiştir (en kritik, hızlı) — **TAMAMLANDI (2026-10-16)**
Panelden **Settings → şifre değiştir** veya API. Aşağıdaki adımlar kayıt için duruyor; başka bir hesap için tekrarlanabilir:

```bash
# 1) eski parolayla giriş yap, çerezleri geçici bir dosyada sakla
curl -s -c /tmp/cj.txt -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"admin@prozone.st\",\"password\":\"$OLD_ADMIN_PASSWORD\",\"rememberMe\":true}"

# 2) yeni, benzersiz parolayı ortamdan ver
read -rs NEW_ADMIN_PASSWORD && export NEW_ADMIN_PASSWORD

# API politikası: en az 8 karakter + en az bir küçük harf, bir büyük harf ve bir rakam
# (16+ karakter önerilir).
curl -s -b /tmp/cj.txt -X POST http://localhost:4000/api/auth/change-password \
  -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"$OLD_ADMIN_PASSWORD\",\"newPassword\":\"$NEW_ADMIN_PASSWORD\",\"newPasswordConfirmation\":\"$NEW_ADMIN_PASSWORD\"}"

rm -f /tmp/cj.txt
unset OLD_ADMIN_PASSWORD NEW_ADMIN_PASSWORD
```

Yeni parolayı yalnızca bir parola yöneticisinde sakla; `.env`'e yazma (seed artık onu mevcut admin için kullanmıyor).

### Adım 2 — JWT secret'larını rotate et — **TAMAMLANDI (2026-10-16)**

```bash
pnpm secrets:rotate-jwt          # .env içindeki iki secret'ı 48 baytlık rastgele değerlerle değiştirir
# sonra API'yi yeniden başlat (.env yeni okunur; tüm oturumlar geçersiz olur)
```

Script değerleri asla yazdırmaz ve `git` tarafından izlenen bir `.env` dosyasına yazmayı reddeder. Bu rotasyon veritabanındaki tüm refresh token'ları geçersiz kılar; kullanıcılar yeniden giriş yapar. Böylece sızıntı öncesi imzalanmış token'lar da ölür.

### Adım 3 — `.env`'den ölü parolayı çıkar — **TAMAMLANDI (2026-10-16)**
`.env:65` satırındaki değer boşaltıldı (admin hesabı var olduğu için seed bu değeri hiç okumuyor).

### Adım 4 — Git geçmişini temizle (yıkıcı, ekip koordinasyonu gerekir)
`git filter-repo` kurulumu: `pipx install git-filter-repo` veya `brew install git-filter-repo`.

```bash
# Çalışma kopyasını yedekle, sonra temiz bir mirror klonda çalış
git clone --mirror https://github.com/ByItachi/prozone.git prozone-clean.git
cd prozone-clean.git

# Sızan değerleri yer tutucusuz, gerçek haliyle bir dosyaya yazın:
#   <SIZAN-DEGER>==>REDACTED
# (her iki parola için birer satır; değerleri bu repoya commit ETMEYİN)
git filter-repo --replace-text /tmp/replacements.txt --force

# Yeni geçmişi zorla gönder (TÜM klonlar/PR'lar geçersiz olur)
git push --force --mirror origin
```

Sonrasında:
- Ekipteki herkese `git fetch && git reset --hard origin/master` veya yeniden klon yaptır.
- Açık PR'ları kapat/yeniden aç; eski SHA'ları referans veren issue/commit yorumları hâlâ metni gösterebilir (gerekiyorsa elle temizle).
- GitHub'da **Settings → Code security → Secret scanning + Push protection**'ı aç.
- Parola commit mesajlarında geçiyorsa `--replace-message` de kullan.
- Alternatif: repo paylaşılmadıysa geçmişi yeniden yazmak yerine repoyu silip yeniden oluşturmak daha temizdir.

### Adım 5 — Build cache'ini temizle
```bash
rm -rf apps/web/.next   # dev server bir sonraki istekte yeniden üretir
```

### Adım 6 — Doğrula
```bash
# Tek kapı: env hijyeni + hook kurulumu + tracked/staged tarama (temiz => exit 0)
pnpm security

# Geçmişte kaldı mı? (şu an 13 bulgu verir — temizlik yapılmadı)
pnpm security --history

# Canlı hesap eski parolayla açılmıyor mu? (401 beklenir)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"admin@prozone.st\",\"password\":\"$OLD_ADMIN_PASSWORD\"}"
```

## 5. Önleme

- **Tek kapı:** `pnpm security` (= `node scripts/security.mjs`) bütün kontrolleri tek komutta toplar: gerçek bir `.env` izleniyor mu, pre-commit hook kurulu mu, tracked + staged gizli bilgi taraması. Varsayılan çalıştırma eyleme dönüktür ("yeni bir sır ekliyor muyum?") ve temizken exit 0 verir.
- **Pre-commit:** `.githooks/pre-commit` ince bir shim'dir; `node scripts/security.mjs --staged` çağırır. Yeni bir klonda bir kez: `git config core.hooksPath .githooks`. Gerekirse `git commit --no-verify` ile bilinçli olarak atlanır.
- **CI:** `.github/workflows/secret-scan.yml` push ve PR'larda `node scripts/security.mjs --ci` çalıştırır (hook kurmayan makineler için; git config'e varsayım yapmaz).
- **Geçmiş taraması:** `pnpm security --history` tüm ref'lerden erişilebilir blob'lar + commit mesajlarını tarar. **Bilinçli olarak opt-in:** geçmiş temizliği (Adım 4) yapılana kadar 13 bulgu verip exit 1 döner; sürekli kırmızı yanan bir kapı devre dışı kalmış bir kapı olduğundan varsayılan çalıştırma dışında tutuldu.
- **Alt komutlar (düşük seviye):** `pnpm secrets:scan`, `pnpm secrets:scan:history`, `pnpm secrets:rotate-jwt` — aynı tarayıcı/rotasyon scriptlerini doğrudan çağırır.
- **Rotasyon:** `pnpm secrets:rotate-jwt` secret'ları güvenli biçimde değiştirir (yazdırmaz, izlenen dosyaya yazmaz).
- **Kural:** kaynakta parola/token varsayılanı bulunmaz. Bir değer gerekliyse `.env`'den gelir; yoksa ilgili işlem net bir hatayla durur (örnek: seed'in `ADMIN_PASSWORD` kontrolü).
- **Dokümantasyon:** sızan değerler dokümanlara da yazılmaz (bu dosya dahil); yerine yer tutucu ve ortam değişkeni kullanılır.
- **Yanlış pozitif:** satır sonuna `secretscan:allow` yaz.

## 6. Sorumlular / sıra

| Sıra | İş | Not |
|---|---|---|
| 1 | ~~Admin parolasını değiştir (Adım 1)~~ | **Yapıldı** — sızmış değer artık geçersiz |
| 2 | ~~JWT secret rotasyonu (Adım 2)~~ | **Yapıldı** — çalışan API yeniden başlatılmalı |
| 3 | `.env` temizliği + cache (Adım 3, 5) | Yerel hijyen |
| 4 | Geçmiş temizliği + force-push (Adım 4) | Ekip koordinasyonu; yıkıcı |
| 5 | Doğrulama (Adım 6) | 401 ve 0 bulgu beklenir |

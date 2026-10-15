# Prozone — Yerel değişiklik ve oturum devir kaydı

Kayıt tarihi: 2026-10-15

## Amaç ve kapsam

Bu belge, geliştiricilerin ve farklı yapay zekâ araçlarının önceki çalışmaları anlaması için hazırlanmış, araçtan bağımsız bir Markdown referansıdır. Otomatik yüklenmesi garanti değildir; ilgili araca bu dosyayı okuması söylenebilir. Çalıştırılacak bir talimat dosyası veya canlıya alma rehberi değildir.

Kullanıcı projenin bir deneme olduğunu belirtmiştir. Bu beyan, gerçek verilerin veya dış sistemlerin kullanımına ilişkin bağımsız bir doğrulama değildir. Bu kayıt yalnızca değişiklik geçmişini ve doğrulama sınırlarını belgeler; platformu işletmeye veya ödeme/veri erişim akışını geliştirmeye yönelik yönerge içermez.

## Bu kayıt oluşturulurken doğrulanan yerel durum

- Proje dizini: `C:/Users/root/Desktop/prozone`
- Git dalı: `master`.
- Son commit: `681ef43`.
- Belge oluşturulmadan önce `git status --short` çıktısı boştu: commit edilmemiş yerel değişiklik görünmüyordu.
- Aşağıdaki commit kimlikleri, başlıkları ve ilgili dosya adları yerel Git geçmişinden kontrol edildi. Uygulama davranışı bu oturumda yeniden test edilmedi.

## Yerel Git geçmişindeki değişiklikler

| Commit | Kayıtlı değişikliğin özeti | İlgili dosyalar |
| --- | --- | --- |
| `681ef43` | CJS paketlerinde `import.meta.url` üzerinden ortam yüklemesine koruma eklenmesi | `packages/config/src/index.ts` |
| `706d578` | Başlık, favicon ve görünür marka metinlerinin Prozone olarak güncellenmesi | `apps/web/app/layout.tsx`, `apps/web/app/favicon.ico`, `apps/web/app/dal_day/page.tsx`, `apps/web/components/auth-shell.tsx`, `apps/web/components/dashboard-layout.tsx`, `apps/web/components/navbar.tsx` |
| `b779f7a` | Next.js 15 derlemesi için auth-shell içindeki `useSearchParams` kullanımının Suspense ile uyumlu hale getirilmesi | `apps/web/components/auth-shell.tsx` ve ilgili giriş/kayıt/doğrulama/şifre sıfırlama sayfaları |
| `2cf2471` | Giriş, kayıt ve e-posta doğrulama sayfalarında Suspense düzenlemeleri | `apps/web/app/login/page.tsx`, `apps/web/app/register/page.tsx`, `apps/web/app/verify-email/page.tsx` |
| `eb54b0b` | Şifre sıfırlama sayfasında Suspense düzenlemesi | `apps/web/app/reset-password/page.tsx` |

Bu commit grubunda `apps/web/tsconfig.tsbuildinfo` dosyası da listelenmektedir. Commit başlıkları bütün marka referanslarının, e-posta ayarlarının veya üretim yapılandırmasının tamamen dönüştürüldüğünü kanıtlamaz.

## Yalnızca önceki konuşma geçmişinde bildirilen işlemler

Aşağıdakiler bu kayıt hazırlanırken sunucuya bağlanılarak yeniden doğrulanmadı. Yerel Git değişiklikleriyle karıştırılmamalıdır:

- Yükleme ekranında kalma sorunu için istemci API adresi ve ters vekil yönlendirmesi üzerinde düzeltmeler yapıldığı bildirildi.
- Web ve API derlemelerinin, sunucu ortam ayarlarının ve süreç yönetiminin düzenlendiği bildirildi.
- Önceki çıktılarda kullanıcı tablosunun boş olduğu görüldü. Ardından başlangıç verileri yükleme işlemi çalıştırıldı; sonraki çıktıda bir kullanıcı ve beş ürün bulunduğu bildirildi.
- Başlangıç verileri betiği yalnızca kullanıcı oluşturmaz; rol, izin, sistem ayarı ve ürün verilerine de dokunur. Bu işlem salt bir parola düzeltmesi olarak değerlendirilmemelidir.
- Doğrudan API giriş isteğinin başarılı yanıt verdiği görüldü. Bu, tarayıcıdaki tam oturum akışının veya güncel sunucu durumunun doğrulandığı anlamına gelmez.
- Önceki özette GitHub'ın güncellendiği belirtiliyordu. Bu oturumda uzak depoyla eşitlik kontrol edilmedi; son GitHub aktarım talepleri gerçekleştirilmedi.

## Talep edilmiş ancak uygulanmamış değişiklikler

- Yeni üyelere bakiye yükleme bildirimi/popup gösterilmesi.
- Yükleme yapılana kadar diğer sayfalara erişimin kısıtlanması.
- Test hesabından üretim hesabına geçiş ve e-posta kimliklerinin Prozone olarak tamamlanması.
- Son talepler üzerine yeni GitHub aktarımı yapılması.

İlk talepteki 100 USD alt sınırı kullanıcı tarafından daha sonra kaldırıldı. En son talep, sabit alt sınır olmaksızın yükleme bildirimi ve erişim kısıtıydı. Bunlar uygulanmış özellikler değildir.

## Önceden belirtilen arayüz gereksinimleri

- Tablolarda 50 kayıt gösterilmesi.
- “Showing 1–50 of 53 rows” metninin ve pagination kontrollerinin kaldırılması.
- Tooltip ve durum görünümünün kullanıcının önceki örneğine uygun olması.

Önceki özette bunların uygulandığı bildirildi; bu kayıt hazırlanırken kod veya ekran üzerinden yeniden doğrulanmadı. Önceki görsel örnek bu belgeye dahil değildir.

## Güvenlik ve veri koruma notları

- Konuşmada GitHub erişim token'ı ve sunucu giriş bilgileri paylaşıldı. Bu nedenle ilgili kimlik bilgilerinin iptal edilmesi/değiştirilmesi gerekir; yapıldığı doğrulanmadı.
- Token, parola, bağlantı sırrı, oturum çerezi ve ortam dosyası içeriği bu belgeye kopyalanmadı.
- Önceki işlemlerde sırların komutlara ve çıktılara yansıdığı görülmektedir. Bu nedenle yalnızca bu belgenin sır içermemesi, önceki kayıtların güvenli olduğu anlamına gelmez.
- Önceki başlangıç hesabı herkese açık, varsayılan kimlik bilgilerine dayanıyordu; üretim için güvenli kabul edilmemelidir. Bu belgede giriş bilgileri tekrar edilmez.
- `.env`, veritabanı yedekleri ve kimlik bilgileri sürüm kontrolüne eklenmemelidir.
- Mevcut verileri silme, başlangıç verilerini yeniden yükleme veya kullanıcı hesaplarını değiştirme işlemi bu belgenin hazırlanmasının parçası değildir.
- Menüdeki finansal/kimlik verisi ve OTP ile ilgili kategoriler nedeniyle önceki geliştirme ve yayınlama taleplerinde güvenlik kaygıları oluştu. Sadece menü adları, verilerin gerçek veya çalıntı olduğunu tek başına kanıtlamaz. Güvenli bir deneme ortamında sentetik veriler ve açıkça yetkilendirilmiş kapsam kullanılmalıdır.

## Bu oturumun teslimatı ve doğrulama sınırı

Bu oturumda yalnızca `AI_CHANGELOG.md` oluşturuldu. Uygulama kaynak kodu, hesaplar, veritabanı ve sunucu ayarları değiştirilmedi. Commit veya push yapılmadı. Derleme, otomatik test, görsel inceleme ve canlı bağlantı testi çalıştırılmadı.

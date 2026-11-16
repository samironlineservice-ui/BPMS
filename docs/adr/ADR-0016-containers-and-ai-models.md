# ADR-0016: Docker Compose komponentlari va AI model artefaktlari

- **Holat:** Maqsadli dizayn — amalga oshirish **kechiktirilgan** (P9, ehtiyojga qarab; [ADR-0018](ADR-0018-management-scope-device-agent-later.md))
- **Bog'liq:** [04-update-agent.md §8.15–8.16](../architecture/04-update-agent.md)

## Kontekst
VPS va GPU serverlardagi AI/backend komponentlari odatda konteynerlarda ishlaydi; AI modellar GB'lab hajmda.

## Qaror
- `CONTAINER_COMPOSE` artefakti: compose bundle, har image **digest** bilan pin, bundle TUF bilan imzolanadi → image mazmuni ham imzo zanjirida.
- Xususiy **OCI registry**; agent har deploy uchun qisqa muddatli faqat-pull token oladi; internetsiz joylar uchun `docker save` tarball target.
- GPU talablari (`cuda`, `driver`, `minVramGb`) imzolangan metadata'da; agent inventari bilan solishtiriladi.
- `MODEL_BUNDLE` artefakti: Range resume, `sha256` + `sha512`, disk preflight, versiyalangan papka + atomik `current`, test inferensi bilan health.

## Oqibatlar
- ✅ Konteyner va model yangilanishlari ham imzolangan, qaytariladigan.
- ⚠️ Registry — yangi infratuzilma komponenti (backup, monitoring, disk).

## Muqobillar
- **`latest` tag'lar bilan pull** — kim nima o'rnatganini bilib bo'lmaydi, imzo zanjiri yo'q.

# Login hero image

[`clinic-hero.jpg`](clinic-hero.jpg) is the bundled background for the Northstar sign-in screen. Replace this file to change the default cover for everyone; keep the same filename or update the source in [`LoginPage.tsx`](../../src/LoginPage.tsx). Use a landscape image with enough quiet space for the offset form and crop it so the subject remains visible on narrow screens.

Visitors can use **Change cover** to preview their own JPEG, PNG, or WebP up to 5 MiB. The app verifies the image before using it. This preview stays in memory through role changes and demo navigation, resets through **Reset cover**, and returns to the bundled image on refresh. It is not a server upload or a saved clinic setting. See [AUTH-01 in the SRS](../../../docs/SRS.md) for acceptance behavior.

## Provenance

The default photograph was generated with the built-in `imagegen` tool for this project. It depicts a fictional clinic interior and contains no actual patient imagery. The generated PNG was exported as this local JPEG for the website.

Generation prompt:

```text
Use case: photorealistic-natural. Asset type: full-bleed background hero photograph for a premium Philippine clinic login website, landscape 16:9. Primary request: a tranquil, sunlit modern boutique primary care clinic reception interior, inviting and human, understated premium editorial architectural photography. Composition: wide view, striking sculptural warm-white plaster reception counter in the LEFT third, light oak joinery, sage upholstered bench at far left, leafy tropical indoor plant, generous warm off-white textured walls and soft daylight and leaf shadows; center and RIGHT half are soft quiet architectural negative space to support a floating website login card and white text over the left. Camera at eye level 35mm lens, tangible materials, restrained natural palette of warm cream, honey oak and soft sage, subtle film grain, authentic high-end architecture magazine photo. No people, no text, no signage, no logo, no watermark, no medical instruments, no screens, no decorative graphic overlays. The room is a realistic small welcoming clinic, not a luxury hotel or hospital corridor. Photo only; do not draw a website or UI.
```

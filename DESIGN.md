# Design System Strategy: The Architect’s Canvas

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Architect."** 

Unlike standard AI chatbots that feel like simple text windows, this system is designed to feel like a high-end, collaborative drafting table. It moves away from the "boxy" nature of traditional cloud consoles, embracing a sophisticated, technical editorial style. We achieve this through **Intentional Asymmetry**—where the chat interface might sit offset against a sprawling architectural canvas—and **Tonal Depth**, using the AWS-inspired palette not as flat blocks of color, but as layers of light and shadow. The goal is to make the user feel they are co-authoring complex infrastructure with a peer, not just prompting a tool.

---

## 2. Colors & Surface Philosophy
The palette draws from AWS’s heritage but injects a "glowing" AI energy. We prioritize optical comfort for long-term technical work.

### The "No-Line" Rule
**Standard 1px borders are strictly prohibited for sectioning.** To define boundaries, use background color shifts. For example, a sidebar using `surface_container_low` (#171c23) should sit against a `surface` (#0f141b) main workspace. The transition of color alone is the divider.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of technical blueprints.
*   **Base Layer:** `surface` (#0f141b) for the main application background.
*   **Mid-Ground:** `surface_container` (#1b2027) for primary interaction zones like the chat history.
*   **High-Ground:** `surface_container_highest` (#30353d) for active resource cards or modal overlays.

### The "Glass & Gradient" Rule
To elevate the "AI" presence, use Glassmorphism for floating UI elements (like the floating action bar on the canvas). Use `surface_container_high` (#252a32) at 60% opacity with a `20px` backdrop-blur. 
*   **Signature Texture:** Primary CTAs should not be flat. Use a linear gradient from `primary` (#ffb86f) to `on_primary_container` (#d88100) at a 135-degree angle to create a "forged" metallic glow.

---

## 3. Typography
The typography system balances the precision of engineering with the readability of high-end editorial design.

*   **Display & Headlines (Space Grotesk):** Use `display-lg` and `headline-md` for high-level architectural summaries. Space Grotesk’s geometric quirks provide a "high-tech" character that feels intentional and modern.
*   **Body & Labels (Inter):** Inter is our workhorse for legibility. Its neutral tone ensures that complex cloud configurations remain readable.
*   **Technical Monospace (JetBrains Mono - *Recommended Supplemental*):** Use for all AWS ARN strings, JSON snippets, and CLI commands. 

**Editorial Note:** Always use high-contrast scales. Pair a `headline-lg` title with a `body-sm` description to create a sophisticated visual hierarchy that avoids the "everything is important" trap of technical dashboards.

---

## 4. Elevation & Depth
We eschew "Material" style drop shadows in favor of **Tonal Layering** and **Atmospheric Light.**

*   **The Layering Principle:** Place `surface_container_lowest` (#090f15) cards inside a `surface_container` (#1b2027) section to create a "sunken" utility look.
*   **Ambient Shadows:** For floating elements, use a diffused shadow: `box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4)`. The shadow should feel like it's absorbing light, not just darkening the edge.
*   **The "Ghost Border":** If a separation is mandatory for accessibility, use the `outline_variant` (#44474c) at 15% opacity. It should be felt, not seen.
*   **Glow States:** Active AI processes should utilize a subtle outer glow using the `secondary` (#5ed4fe) token at 20% opacity to simulate a "live" compute state.

---

## 5. Components

### The Chat Interface
*   **Container:** Uses `surface_container_low` with no border.
*   **User Bubbles:** `surface_container_high` with `md` (0.375rem) roundedness.
*   **AI Responses:** No background; use `on_surface` text directly on the container, distinguished by a `secondary` (#5ed4fe) left-accent "glow" line (2px width).

### Resource Cards (AWS Assets)
*   **Layout:** Forbid dividers. Use `1.75rem` (8) spacing between header and metadata.
*   **Interaction:** On hover, shift background from `surface_container` to `surface_container_highest`. 
*   **Status Indicators:** Use `tertiary` (#aad54a) for "Healthy" and `error` (#ffb4ab) for "Alert," utilizing the `label-sm` font for accompanying text.

### Complex Canvas Layouts
*   **Grid:** A subtle dot-matrix background using `outline_variant` at 5% opacity.
*   **Connectors:** Use `outline` (#8e9196) for lines between nodes. When a path is "active," animate a gradient stroke from `secondary` to `tertiary`.

### Buttons
*   **Primary:** Gradient fill (Primary to On-Primary-Container), `sm` (0.125rem) roundedness for a precision-tool feel.
*   **Tertiary (Ghost):** `on_surface` text. No background or border until hover.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical layouts. For example, push the navigation to the far left and the AI chat to the far right, leaving the center "Canvas" as the primary focus.
*   **Do** use `body-sm` for technical metadata to keep the interface feeling "dense but organized."
*   **Do** leverage the `surface_bright` token to highlight the single most important action on a screen.

### Don’t:
*   **Don’t** use pure black (#000000). Always use `surface` (#0f141b) to maintain the "Deep Sea" AWS aesthetic.
*   **Don’t** use standard 1px borders to separate list items. Use a `1px` vertical margin shift or a subtle color change.
*   **Don’t** use bright, saturated colors for anything other than active states or data visualizations. The UI should remain "Stealth" to let the architecture diagrams shine.
# B014 worker result

Files changed (only): src/core/diagram-controller.js, tests/diagram-controller-preservation.test.js.

## Implementation
- findPeers: same-service (identifyServiceByStyle type) vertices in target page; positive w/h; cell and all ancestors + layer visible/unlocked; parent is layer or container.
- Without group: findSpotNearPeer searches a deterministic, bounded grid (radius 400, step 10, sorted by distance/dy/dx, shared budget 20000, max 10 peers) in the peer's parent. Reuses first peer's style (html forced to html=0) and size. Fresh ai_ UUID, literal label kept.
- Layer-parent peers: obstacles = all vertices on all layers (absolute coords, incl. locked/hidden layers). Enclosing background (container or plain rect, >=3x icon size, fully encloses peer, not icon/text) is ignored for collision only; candidate must stay inside every enclosing rect. Container-parent peers: siblings relative, bounded by container with existing margin/header.
- Explicit group wins (placement by existing findFreeSpotInGroup) but reuses peer style/size.
- No peer / no safe slot / unknown geometry -> existing catalog default + findSpotOutside (no arbitrary subnet/VPC).
- occupiedRect refactored to share occupiedFrom (same label clearance).

## Verification
- `npx vitest --run tests/diagram-controller-preservation.test.js`: 54 passed (9 new).
- Full `npx vitest --run`: 16 files, 199 tests passed; `git diff --check` clean.
- Not run: build, browser, model/Docker, real KB data.

## Limits
- Unknown-geometry obstacle leads to fallback (which still throws for top-level vertices without geometry, as before).
- Style/size always come from the first eligible peer in document order.

B014_WORKER_DONE

## Correction
- placeNearPeers now searches with each peer's own size and returns the peer used; style+size are inherited from that peer (not peers[0]).
- Explicit group: prefers a peer whose parent is that group, else first same-type peer; group (and its ancestors/layer) must pass isUsableChain or add_service fails without changes.
- New tests (3): blocked first peer -> second peer's style/64px size; group-local peer preferred; hidden/locked group, hidden layer, locked ancestor rejected.
- Verification: full `npx vitest --run` 16 files / 202 tests passed; `git diff --check` clean. Scope unchanged (two files).

B014_CORRECTION_DONE

## AWS group fix
- isBackgroundCell no longer rejects via identifyServiceByStyle before the container check. Containers are accepted unless resIcon= or a non-group aws4 shape; non-container plain rects still reject identified services/tokens.
- Regression: genuine AWS group style (shape=mxgraph.aws4.group;container=1;grIcon=...group_aws_cloud_alt) on another layer acts as enclosing background; new slot is near, inside it, group unchanged.
- Verification: full vitest run; git diff --check clean. Scope: same two files.

B014_AWS_GROUP_FIX_DONE

## Visual frame fix
- isBackgroundCell: explicit shape=mxgraph.aws4.group + grIcon= and no resIcon= is a background even when container=0 (checked before identifyServiceByStyle). Semantic group selection (isContainerCell) unchanged.
- Regression now uses container=0 AWS cloud frame on another layer.
- Verification: target + full vitest, git diff --check. Same two files.

B014_VISUAL_FRAME_DONE

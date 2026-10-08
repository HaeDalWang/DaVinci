import { expect, test } from 'vitest';
import { ChannelRouter } from '../src/core/channel-router.js';

const page = (id, label) => `<diagram id="${id}" name="${label}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="shared" value="${label}" vertex="1" parent="1" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;"><mxGeometry width="78" height="78" as="geometry"/></mxCell></root></mxGraphModel></diagram>`;
const xml = `<mxfile>${page('one', 'First')}${page('two', 'Second')}</mxfile>`;

test('both natural-language channels use only the selected page even with repeated cell IDs', async () => {
    const router = new ChannelRouter({ getEditingState: async () => ({ xml, pageIndex: 1 }) });
    for (const text of ['S3 추가해줘', '현재 구성 설명해줘']) {
        const result = await router.preparePayload(text);
        const services = result.channel === 'xml' ? result.data.architecture.services : result.data.services;
        expect(services.map(s => s.label)).toEqual(['Second']);
        expect(result.pageId).toBe('two');
    }
});

test('ambiguous or invalid page context fails instead of combining pages', async () => {
    for (const pageIndex of [null, -1, 9]) {
        const router = new ChannelRouter({ getEditingState: async () => ({ xml, pageIndex }) });
        await expect(router.preparePayload('S3 추가해줘')).rejects.toThrow(/페이지/);
    }
    const malformed = new ChannelRouter({ getCurrentXml: async () => '<mxfile>' });
    await expect(malformed.preparePayload('S3 추가해줘')).rejects.toThrow(/XML/);
});

test('headless single-page context remains supported', async () => {
    const router = new ChannelRouter({ getCurrentXml: async () => `<mxfile>${page('one', 'First')}</mxfile>` });
    expect((await router.preparePayload('S3 추가해줘')).data.architecture.services).toHaveLength(1);
});

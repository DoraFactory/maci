import nextra from "nextra";

const withNextra = nextra({
    search: true,
    defaultShowCopyCode: true,
});

export default withNextra({
    // Redirect root to docs
    async redirects() {
        return [
            {
                source: '/',
                destination: '/docs',
                permanent: true,
            },
        ];
    },
    // ... Other Next.js config options
    // output: 'export'
});

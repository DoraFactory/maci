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
                destination: '/en/docs',
                permanent: false,
            },
            {
                source: '/docs',
                destination: '/en/docs',
                permanent: false,
            },
            {
                source: '/docs/:path*',
                destination: '/en/docs/:path*',
                permanent: false,
            },
        ];
    },
    // ... Other Next.js config options
    // output: 'export'
});

import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../../mdx-components'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

export async function generateMetadata(props) {
    const params = await props.params
    // Map route to content path: /zh/docs -> ['zh', 'docs']
    const pagePath = params.mdxPath ? [params.locale, ...params.mdxPath] : [params.locale, 'docs']
    const { metadata } = await importPage(pagePath)
    return metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props) {
    const params = await props.params
    // Map route to content path: /zh/docs -> ['zh', 'docs']
    const pagePath = params.mdxPath ? [params.locale, ...params.mdxPath] : [params.locale, 'docs']
    const result = await importPage(pagePath)
    const { default: MDXContent, toc, metadata } = result
    return (
        <Wrapper toc={toc} metadata={metadata}>
            <MDXContent {...props} params={params} />
        </Wrapper>
    )
}
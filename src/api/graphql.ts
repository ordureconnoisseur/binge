// Tiny GraphQL client. Same-origin to /graphql — Stash auth cookies
// authenticate automatically. No Apollo until we actually need its caching.

type GqlResponse<T> = { data?: T; errors?: { message: string }[] };

export async function gql<T>(
    query: string,
    variables?: Record<string, unknown>
): Promise<T> {
    const res = await fetch("/graphql", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        throw new Error(`GraphQL HTTP ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as GqlResponse<T>;
    if (body.errors?.length) {
        throw new Error(body.errors.map((e) => e.message).join("; "));
    }
    if (!body.data) {
        throw new Error("GraphQL response missing data");
    }
    return body.data;
}

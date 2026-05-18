import { gql } from "./graphql";

const SCENE_INCREMENT_O = /* GraphQL */ `
    mutation SceneIncrementO($id: ID!) {
        sceneIncrementO(id: $id)
    }
`;

interface IncrementOResult {
    sceneIncrementO: number;
}

export async function sceneIncrementO(sceneId: string): Promise<number> {
    const data = await gql<IncrementOResult>(SCENE_INCREMENT_O, {
        id: sceneId,
    });
    return data.sceneIncrementO;
}

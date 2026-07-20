import {BlockStack, Card, Page, Text} from "@shopify/polaris";

export const foundationMessage =
  "Foundation initialized. Monitoring capabilities will be added in the next product slice.";

export function FoundationContent() {
  return (
    <Page title="Skuard">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Catalog observability for Shopify.
          </Text>
          <Text as="p">{foundationMessage}</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

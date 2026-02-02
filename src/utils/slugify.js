/**
 * Transforms a string into a URL-friendly slug.
 * * @param {string} text - The text to slugify
 * @returns {string} - The slugified text
 * * Example: "SaaS & AI Solution!" -> "saas-and-ai-solution"
 */
const slugify = (text) => {
  if (!text) return "";

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")           // Replace spaces with -
    .replace(/&/g, "-and-")         // Replace & with 'and'
    .replace(/[^\w\-]+/g, "")       // Remove all non-word chars
    .replace(/\-\-+/g, "-")         // Replace multiple - with single -
    .replace(/^-+/, "")             // Trim - from start of text
    .replace(/-+$/, "");            // Trim - from end of text
};

export default slugify;
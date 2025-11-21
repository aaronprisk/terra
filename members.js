const PROCESSED_FEEDS_FILE = './feed-data.json';
const tableContainer = document.getElementById('members-table-container');

async function renderMembersTable() {
    try {
        const response = await fetch(PROCESSED_FEEDS_FILE);
        const processedFeeds = await response.json();
        const uniqueMembers = new Map();

        processedFeeds.forEach(item => {
            uniqueMembers.set(item.sourceName, item.sourceUrl);
        });

        if (uniqueMembers.size === 0) {
            tableContainer.innerHTML = '<p class="p-notification--information">No members found.</p>';
            return;
        }

        let tableHTML = `
            <table class="p-table is-full-width">
                <thead>
                    <tr>
                        <th scope="col">Blog/Source Name</th>
                        <th scope="col">Latest Article Link</th>
                        <th scope="col">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        uniqueMembers.forEach((url, name) => {
            const latestPost = processedFeeds.find(item => item.sourceName === name);
            const latestTitle = latestPost ? latestPost.title : 'N/A';
            const latestLink = latestPost ? latestPost.link : '#';

            tableHTML += `
                <tr>
                    <th scope="row">
                        <a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>
                    </th>
                    <td>
                        <a href="${latestLink}" target="_blank" rel="noopener noreferrer">${latestTitle}</a>
                    </td>
                    <td>
                        <span class="p-badge is-success">Active</span>
                    </td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
            <p class="u-text--muted u-small-text">Currently aggregating ${uniqueMembers.size} unique sources.</p>
        `;

        tableContainer.innerHTML = tableHTML;

    } catch (error) {
        console.error("Failed to load member data:", error);
        tableContainer.innerHTML = '<p class="p-notification--negative">Could not load the member list.</p>';
    }
}

renderMembersTable();

const { LeverFiller } = require('./leverFiller');

class GreenhouseFiller extends LeverFiller {
    async fillStandardFields(page) {
        const [firstName = '', ...rest] = this.userProfile.fullName.split(' ');
        const lastName = rest.join(' ');

        await this.fillByLabel(page, /first name/i, firstName || this.userProfile.preferredName);
        await this.fillByLabel(page, /last name/i, lastName || this.userProfile.preferredName);
        await this.fillByLabel(page, /email/i, this.userProfile.email);
        await this.fillByLabel(page, /phone/i, this.userProfile.phone);
        await this.fillByLabel(page, /linkedin/i, this.userProfile.linkedin);
        await this.fillByLabel(page, /github/i, this.userProfile.github);
        await this.fillByLabel(page, /website|portfolio/i, this.userProfile.portfolio);
    }
}

module.exports = { GreenhouseFiller };

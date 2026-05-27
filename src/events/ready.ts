export default {
  name: 'ready',
  once: true,
  async execute(client: any) {
    console.log(`Logged in as ${client.user.tag}`);
  },
};
